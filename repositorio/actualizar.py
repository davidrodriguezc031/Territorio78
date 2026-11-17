#!/usr/bin/env python3
"""Detecta publicaciones oficiales e importa series seleccionadas de Puerto Rico."""

import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import csv
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import io
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile


ROOT = Path(__file__).resolve().parent
CATALOG_URL = "https://api.census.gov/data.json"
FTP_ACS = "https://www2.census.gov/programs-surveys/acs/summary_file"
PEP_PAGE = "https://www.census.gov/data/datasets/time-series/demo/popest/2020s-total-puerto-rico-municipios.html"
PEP_SERIES = "pep/municipios"
PR_GEOID = re.compile(r"72(?:\d{3}(?:\d{5})?)?\Z")
GEO_PREFIX = {"040": 2, "050": 5, "060": 10}
SENTINELS = {-999999999, -888888888, -666666666, -555555555, -333333333, -222222222}
MULTIYEAR_YEAR = 2021
SCHEMA = """
CREATE TABLE IF NOT EXISTS catalogo (
    id TEXT PRIMARY KEY, serie TEXT NOT NULL, anio INTEGER, titulo TEXT NOT NULL,
    url TEXT NOT NULL, modificacion_censo TEXT, alcance_pr TEXT NOT NULL,
    huella TEXT NOT NULL, detectado_utc TEXT NOT NULL,
    revisado_utc TEXT NOT NULL, vigente_en_catalogo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS publicacion (
    id TEXT PRIMARY KEY, titulo TEXT NOT NULL, anio INTEGER NOT NULL, periodo TEXT NOT NULL,
    fuente_url TEXT NOT NULL, consultas_json TEXT NOT NULL, variables_json TEXT NOT NULL,
    firma_config TEXT NOT NULL, version_catalogo TEXT NOT NULL,
    verificado_utc TEXT NOT NULL, catalogo_id TEXT REFERENCES catalogo(id)
);
CREATE TABLE IF NOT EXISTS observacion (
    publicacion_id TEXT NOT NULL REFERENCES publicacion(id) ON DELETE CASCADE,
    geoid TEXT NOT NULL, variable_id TEXT NOT NULL,
    valor REAL, margen_error REAL, valor_original TEXT, margen_original TEXT,
    PRIMARY KEY (publicacion_id, geoid, variable_id)
);
CREATE TABLE IF NOT EXISTS cambios (
    fecha_utc TEXT NOT NULL, dataset_id TEXT NOT NULL, tipo TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS metadatos_publicacion (
    publicacion_id TEXT PRIMARY KEY REFERENCES publicacion(id) ON DELETE CASCADE,
    contenido TEXT NOT NULL
);
"""


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True, allow_nan=False)


def digest(value):
    return hashlib.sha256(compact(value).encode()).hexdigest()


def official_http(url):
    parsed = urlsplit(url)
    domain = parsed.hostname or ""
    if parsed.scheme not in {"http", "https"} or not domain.endswith(".census.gov") or parsed.username:
        raise ValueError("Se esperaba una URL oficial del Census Bureau.")
    return urlunsplit(parsed._replace(scheme="https"))


def download(url, *, key=None):
    url = official_http(url)
    request_url = url
    if key:
        request_url += ("&" if "?" in url else "?") + urlencode({"key": key})
    request = Request(request_url, headers={"User-Agent": "ObservatorioCensoPR/1.0"})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=60) as response:
                official_http(response.geturl())
                return response.read()
        except HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise RuntimeError(f"Respuesta HTTP {exc.code} en {url}") from None
        except (URLError, TimeoutError):
            if attempt == 2:
                raise RuntimeError(f"No se pudo descargar {url}") from None
        time.sleep(2 ** attempt)


def parse_json(content, url):
    try:
        return json.loads(content)
    except (ValueError, UnicodeDecodeError):
        raise ValueError(f"Census no devolvió JSON válido para {url}. Comprueba acceso o clave.") from None


def catalog_entry(item):
    series = "/".join(item.get("c_dataset", []))
    title = item["title"]
    text = " ".join((title, item.get("description", ""), item.get("spatial", "")))
    explicit = re.search(r"Puerto Rico|Puerto Rican|\bPRCS\b", text, re.I)
    programs = {
        "acs", "acs1", "acs5", "dec", "cbp", "zbp", "nonemp", "pep", "geoinfo", "econ",
        "abscb", "abscs", "abstcb", "crepuertorico", "pdb", "ecn", "intltrade", "sbo",
    }
    family = series.split("/")[0]
    if not explicit and family not in programs and not family.startswith("ecn"):
        return None
    distributions = [entry["accessURL"] for entry in item.get("distribution", []) if entry.get("accessURL")]
    if not distributions:
        return None
    try:
        url = official_http(distributions[0])
        identifier = official_http(item["identifier"])
    except ValueError:
        return None
    public = item.get("c_isAvailable", True) is not False
    entry = {
        "id": identifier, "serie": series, "anio": item.get("c_vintage"), "titulo": title,
        "url": url, "modificacion_censo": item.get("modified"),
        "alcance_pr": "menciona_pr" if explicit else "verificar_cobertura",
        "disponible": public,
    }
    entry["huella"] = digest(item)
    return entry


def update_catalog(db):
    payload = parse_json(download(CATALOG_URL), CATALOG_URL)
    items = payload.get("dataset")
    if not isinstance(items, list) or len(items) < 100:
        raise ValueError("Catálogo oficial vacío o incompleto.")
    by_id = {}
    for item in items:
        entry = catalog_entry(item)
        if entry:
            by_id[entry["id"]] = entry
    checked = now()
    changes = defaultdict(int)
    with db:
        db.execute("BEGIN IMMEDIATE")
        previous = {
            row["id"]: (row["huella"], row["vigente_en_catalogo"])
            for row in db.execute("SELECT * FROM catalogo WHERE serie <> ?", (PEP_SERIES,))
        }
        active_previous = sum(value[1] for value in previous.values())
        if len(by_id) < 30 or active_previous and len(by_id) < active_previous * 0.75:
            raise ValueError("El catálogo oficial devolvió un conjunto inesperadamente pequeño.")
        for identifier, entry in by_id.items():
            last = previous.get(identifier)
            active = int(entry["disponible"])
            if last is None:
                event = ("publicado" if previous else "inventario_inicial") if active else "registrado"
            elif active != last[1]:
                event = "reincorporado" if active else "marcado_no_disponible"
            elif entry["huella"] != last[0]:
                event = "actualizado"
            else:
                event = None
            if event:
                changes[event] += 1
                db.execute("INSERT INTO cambios VALUES (?, ?, ?)", (checked, identifier, event))
            db.execute(
                """INSERT INTO catalogo VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET serie=excluded.serie, anio=excluded.anio,
                titulo=excluded.titulo, url=excluded.url, modificacion_censo=excluded.modificacion_censo,
                alcance_pr=excluded.alcance_pr, huella=excluded.huella, revisado_utc=excluded.revisado_utc,
                vigente_en_catalogo=excluded.vigente_en_catalogo""",
                (
                    identifier, entry["serie"], entry["anio"], entry["titulo"], entry["url"],
                    entry["modificacion_censo"], entry["alcance_pr"], entry["huella"], checked, checked, active,
                ),
            )
        for identifier in previous.keys() - by_id.keys():
            if previous[identifier][1]:
                changes["ausente"] += 1
                db.execute("UPDATE catalogo SET vigente_en_catalogo=0 WHERE id=?", (identifier,))
                db.execute("INSERT INTO cambios VALUES (?, ?, ?)", (checked, identifier, "ausente"))
    print(f"Catálogo oficial: {len(items)} entradas totales, {len(by_id)} en el seguimiento de Puerto Rico.")
    if changes:
        print("Cambios en inventario:", dict(changes))


def numeric(raw):
    if raw is None or (isinstance(raw, str) and raw.strip() in {"", "null", "N", "-", "**", "***", "*****"}):
        return None
    result = float(raw)
    if not math.isfinite(result):
        raise ValueError("La cifra contiene un valor numérico no finito.")
    if result in SENTINELS:
        return None
    return int(result) if result.is_integer() else result


def read_acs_table(table, variables, source):
    body = download(source)
    provenance = {"url": source, "sha256": hashlib.sha256(body).hexdigest()}
    reader = csv.reader(io.TextIOWrapper(io.BytesIO(body), encoding="utf-8-sig"), delimiter="|")
    fields = next(reader, [])
    try:
        geoid_index = fields.index("GEO_ID")
        pairs = [
            (var["id"], fields.index(f"{table}_E{var['line']}"), fields.index(f"{table}_M{var['line']}"))
            for var in variables
        ]
    except ValueError as exc:
        raise ValueError(f"{table}: esquema de Summary File inesperado.") from exc
    records = {}
    for row in reader:
        if not row:
            continue
        full = row[geoid_index]
        code = full[9:]
        if full[3:9] != "0000US" or len(code) != GEO_PREFIX.get(full[:3]) or not PR_GEOID.fullmatch(code):
            continue
        if code in records:
            raise ValueError(f"{table}: GEOID duplicado {code}.")
        records[code] = {var_id: (row[estimate], row[margin]) for var_id, estimate, margin in pairs}
    if "72" not in records:
        raise ValueError(f"{table}: la tabla no contiene una fila para todo Puerto Rico.")
    return records, provenance


def bulk_acs(entry, spec):
    year, years = entry["anio"], spec["window"]
    base = f"{FTP_ACS}/{year}/table-based-SF/data/{years}YRData/"
    tables = defaultdict(list)
    for var in spec["variables"]:
        tables[var["table"]].append(var)
    combined, sources = {}, []
    with ThreadPoolExecutor(max_workers=3) as workers:
        pending = {
            table: workers.submit(read_acs_table, table, variables, f"{base}acsdt{years}y{year}-{table.lower()}.dat")
            for table, variables in tables.items()
        }
        for table, future in pending.items():
            records, source = future.result()
            for code, values in records.items():
                combined.setdefault(code, {}).update(values)
            sources.append(source)
    for geography in combined.values():
        for variable in spec["variables"]:
            geography.setdefault(variable["id"], (None, None))
    return combined, sources, base


def api_data(entry, spec, key):
    metadata_url = entry["url"] + "/variables.json"
    metadata = download(metadata_url)
    available = parse_json(metadata, metadata_url)["variables"]
    variables = []
    for variable in spec["variables"]:
        field = variable.get("field", variable["id"])
        margin = variable.get("marginField", field.removesuffix("E") + "M")
        if field in available and (not variable["moe"] or margin in available):
            variables.append(variable)
    if not variables:
        raise ValueError("La edición no incluye variables configuradas en la API.")
    fields = ["NAME"]
    for variable in variables:
        field = variable.get("field", variable["id"])
        fields.append(field)
        if variable["moe"]:
            fields.append(variable.get("marginField", field.removesuffix("E") + "M"))
    queries = [
        ([("for", "state:72")], ["state"]),
        ([("for", "county:*"), ("in", "state:72")], ["state", "county"]),
    ]
    if spec["barrios"]:
        queries.append((
            [("for", "county subdivision:*"), ("in", "state:72"), ("in", "county:*")],
            ["state", "county", "county subdivision"],
        ))
    combined = {}
    sources = [{"url": metadata_url, "sha256": hashlib.sha256(metadata).hexdigest()}]
    for predicates, columns in queries:
        source = entry["url"] + "?" + urlencode([("get", ",".join(fields))] + predicates)
        body = download(source, key=key)
        response = parse_json(body, source)
        if not isinstance(response, list) or not response or not set(fields + columns).issubset(response[0]):
            raise ValueError(f"Estructura de respuesta inesperada: {source}")
        sources.append({"url": source, "sha256": hashlib.sha256(body).hexdigest()})
        for fields_row in response[1:]:
            row = dict(zip(response[0], fields_row, strict=True))
            code = "".join(row[name] for name in columns)
            if not PR_GEOID.fullmatch(code) or code in combined:
                raise ValueError(f"Geografía inválida o repetida: {code}.")
            combined[code] = {}
            for var in variables:
                field = var.get("field", var["id"])
                margin = var.get("marginField", field.removesuffix("E") + "M")
                combined[code][var["id"]] = (row[field], row[margin] if var["moe"] else None)
    return combined, sources, entry["url"], variables


def catalog_rows(db, specs, years, series, history):
    for code, spec in specs.items():
        if series and code not in series:
            continue
        rows = db.execute(
            "SELECT * FROM catalogo WHERE serie=? AND vigente_en_catalogo=1 ORDER BY anio DESC", (code,)
        )
        eligible = [
            row for row in rows
            if row["anio"] and row["anio"] >= spec.get("firstYear", 0) and (not years or row["anio"] in years)
        ]
        for row in eligible if (history or years or spec["window"] == 0) else eligible[:1]:
            yield row, spec


def normalize(registry, variables, *, full_municipios=False, barrios=False, require_territory=True):
    ids = [var["id"] for var in variables]
    if not ids or len(ids) != len(set(ids)):
        raise ValueError("Se necesitan identificadores de variables únicos.")
    if (require_territory and "72" not in registry) or not all(PR_GEOID.fullmatch(code) for code in registry):
        raise ValueError("La publicación contiene códigos geográficos inesperados para Puerto Rico.")
    municipalities = {code for code in registry if len(code) == 5}
    subdivisions = {code for code in registry if len(code) == 10}
    if full_municipios and len(municipalities) != 78:
        raise ValueError(f"Se esperaban 78 municipios; se encontraron {len(municipalities)}.")
    if barrios and not subdivisions:
        raise ValueError("El producto debe contener barrios de Puerto Rico.")
    if any(code[:5] not in municipalities for code in subdivisions):
        raise ValueError("La publicación incluye un barrio sin municipio de referencia.")
    output = []
    has_numeric = False
    for code, data in registry.items():
        if set(data) != set(ids):
            raise ValueError(f"{code}: faltan variables publicadas para esa geografía.")
        for variable, (value, margin) in data.items():
            parsed_value, parsed_margin = numeric(value), numeric(margin)
            if parsed_margin is not None and parsed_margin < 0:
                raise ValueError(f"{code}: margen de error negativo para {variable}.")
            has_numeric = has_numeric or parsed_value is not None
            output.append((code, variable, parsed_value, parsed_margin, value, margin))
    if not has_numeric:
        raise ValueError("No se encontró ninguna cifra numérica en la publicación.")
    return output


def persist(db, publication, observations, metadata=None):
    db.execute(
        """INSERT INTO publicacion VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET titulo=excluded.titulo, anio=excluded.anio,
        periodo=excluded.periodo, fuente_url=excluded.fuente_url, consultas_json=excluded.consultas_json,
        variables_json=excluded.variables_json, firma_config=excluded.firma_config,
        version_catalogo=excluded.version_catalogo, verificado_utc=excluded.verificado_utc,
        catalogo_id=excluded.catalogo_id""",
        publication,
    )
    db.execute("DELETE FROM observacion WHERE publicacion_id=?", (publication[0],))
    db.executemany(
        "INSERT INTO observacion VALUES (?, ?, ?, ?, ?, ?, ?)",
        ((publication[0], *row) for row in observations),
    )
    db.execute(
        "INSERT OR REPLACE INTO metadatos_publicacion VALUES (?, ?)",
        (publication[0], compact(metadata or {})),
    )


def save(db, publication, observations, metadata=None):
    with db:
        persist(db, publication, observations, metadata)


def acquire(db, entry, spec, key, refresh):
    year = entry["anio"]
    identifier = f"{spec['id']}-{year}"
    signature = digest(spec)
    last = db.execute("SELECT * FROM publicacion WHERE id=?", (identifier,)).fetchone()
    if not refresh and last and last["firma_config"] == signature and last["version_catalogo"] == entry["huella"]:
        return
    selected_variables = spec["variables"]
    if spec["window"] and year >= MULTIYEAR_YEAR:
        registry, sources, source_url = bulk_acs(entry, spec)
    elif key:
        registry, sources, source_url, selected_variables = api_data(entry, spec, key)
    else:
        print(f"Pendiente {identifier}: la API de Census requiere CENSUS_API_KEY.")
        return
    variables = []
    for var in selected_variables:
        variable = {k: v for k, v in var.items() if k != "line"}
        if spec["window"] and year >= MULTIYEAR_YEAR:
            variable["sourceUrl"] = f"{source_url}acsdt{spec['window']}y{year}-{var['table'].lower()}.dat"
        variables.append(variable)
    count = spec["window"]
    period = f"{year - count + 1}–{year}" if count > 1 else str(year)
    observations = normalize(
        registry, variables, full_municipios=spec["fullMunicipios"], barrios=spec["barrios"]
    )
    save(
        db,
        (
            identifier, spec["title"], year, period, source_url, compact(sources), compact(variables),
            signature, entry["huella"], now(), entry["id"],
        ),
        observations,
        {
            "accessed": now()[:10],
            "methodologyUrl": (
                "https://www.census.gov/programs-surveys/acs/data/summary-file.html"
                if count else source_url
            ),
            "notes": (
                f"Estimados ACS para {period}. Márgenes de error al 90 %. "
                f"Los ingresos se expresan en dólares de {year}."
                if count else "Cifras oficiales del censo decenal."
            ),
        },
    )
    print(f"Importado {identifier}: {len(registry):,} geografías, {len(observations):,} observaciones.")


class PepLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.vintages = {}

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        url = dict(attrs).get("href") or ""
        if url.startswith("//"):
            url = "https:" + url
        match = re.fullmatch(
            r"https://www2\.census\.gov/programs-surveys/popest/tables/2020-20\d{2}"
            r"/municipios/totals/prm-est(20\d{2})-pop\.xlsx",
            url,
            re.IGNORECASE,
        )
        if match:
            self.vintages[int(match[1])] = url


def pep_workbook(body, vintage, codes):
    with ZipFile(io.BytesIO(body)) as archive:
        table = ElementTree.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        text = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
    strings = ["".join(node.text or "" for node in item.iterfind(".//{*}t")) for item in text]
    rows = {}
    for row in table.findall(".//{*}row"):
        cells = {}
        for cell in row.findall("{*}c"):
            value = cell.findtext("{*}v")
            if value is not None:
                column = cell.get("r").rstrip("0123456789")
                cells[column] = strings[int(value)] if cell.get("t") == "s" else value
        rows[int(row.get("r"))] = cells
    if "July 1" not in rows[3].get("C", ""):
        raise ValueError("No se pudo verificar la fecha de referencia de la tabla PEP.")
    year_columns = {
        int(value): column for column, value in rows[4].items() if re.fullmatch(r"20\d{2}", value)
    }
    if sorted(year_columns) != list(range(2020, vintage + 1)):
        raise ValueError("Años inesperados en la tabla PEP.")
    result = {}
    for cells in rows.values():
        label = cells.get("A", "").lstrip(".").strip()
        geoid = "72" if label == "Puerto Rico" else codes.get(label.removesuffix(", Puerto Rico"))
        if not geoid:
            continue
        if geoid in result:
            raise ValueError(f"GEOID repetido en el producto PEP: {geoid}.")
        result[geoid] = {year: cells.get(column) for year, column in year_columns.items()}
    if len(result) != 79:
        raise ValueError("La tabla PEP debe identificar inequívocamente a Puerto Rico y sus 78 municipios.")
    for year in year_columns:
        values = [numeric(row[year]) for row in result.values()]
        if any(value is None or value < 0 or not isinstance(value, int) for value in values):
            raise ValueError(f"Población PEP inválida para {year}.")
        if sum(values) != 2 * numeric(result["72"][year]):
            raise ValueError(f"Los municipios no suman el total de Puerto Rico en {year}.")
    return result


def update_pep(db, years, refresh):
    links = PepLinks()
    links.feed(download(PEP_PAGE).decode("utf-8"))
    if not links.vintages:
        raise ValueError("La página oficial no contiene enlaces PEP reconocibles.")
    vintages = sorted(links.vintages, reverse=True)
    reference = json.loads((ROOT / "municipios.json").read_text(encoding="utf-8"))
    variables = [{
        "id": "population", "label": "Población residente al 1 de julio",
        "unit": "personas", "moe": False, "table": "PRM-POP",
    }]
    title = "Estimaciones anuales de población residente · PEP"
    for vintage in (year for year in vintages if year in years) if years else vintages[:1]:
        source = links.vintages[vintage]
        last = db.execute("SELECT * FROM catalogo WHERE id=?", (source,)).fetchone()
        if last and not refresh:
            continue
        body = download(source)
        file_hash = hashlib.sha256(body).hexdigest()
        try:
            result = pep_workbook(body, vintage, reference["codes"])
        except (BadZipFile, ElementTree.ParseError, KeyError) as exc:
            raise ValueError("Cambió el formato interno de la tabla PEP.") from exc
        checked = now()
        with db:
            db.execute(
                """INSERT INTO catalogo VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET huella=excluded.huella, revisado_utc=excluded.revisado_utc""",
                (source, PEP_SERIES, vintage, title, source, None, "menciona_pr", file_hash, checked, checked, 1),
            )
            if not last or last["huella"] != file_hash:
                event = "publicado" if not last else "actualizado"
                db.execute("INSERT INTO cambios VALUES (?, ?, ?)", (checked, source, event))
            sources = [{"url": source, "sha256": file_hash}, {"url": PEP_PAGE}, {"url": reference["sourceUrl"]}]
            for year in range(2020, vintage + 1):
                registry = {code: {"population": (data[year], None)} for code, data in result.items()}
                observations = normalize(registry, variables, full_municipios=True)
                persist(
                    db,
                    (
                        f"pep-{vintage}-{year}", f"{title} · edición {vintage}", year, str(year), source,
                        compact(sources), compact(variables), digest(variables), file_hash, checked, source,
                    ),
                    observations,
                    {
                        "accessed": checked[:10], "methodologyUrl": PEP_PAGE,
                        "notes": f"Población residente al 1 de julio. Edición {vintage}.",
                    },
                )
        print(f"Importado PEP edición {vintage}: 79 geografías y años 2020–{vintage}.")


def seed(db, path):
    payload = json.loads(path.read_text(encoding="utf-8"))
    for dataset in payload["datasets"]:
        variables = dataset["variables"]
        ids = [var["id"] for var in variables]
        registry = {
            code: dict(zip(ids, pairs, strict=True)) for code, pairs in dataset["rows"].items()
        }
        source_url = official_http(dataset["sourceUrl"])
        links = [source_url, dataset.get("methodologyUrl"), dataset.get("qualityUrl"), *dataset.get("additionalSourceUrls", [])]
        links.extend(var.get("sourceUrl") for var in variables)
        links.extend(item["url"] if isinstance(item, dict) else item for item in dataset.get("sources", []))
        sources = [{"url": official_http(url)} for url in dict.fromkeys(links) if url]
        observed = normalize(registry, variables, require_territory=False)
        previous = db.execute("SELECT catalogo_id FROM publicacion WHERE id=?", (dataset["id"],)).fetchone()
        if previous and previous["catalogo_id"]:
            print(f"Se conserva la importación directa de {dataset['id']}.")
            continue
        save(
            db,
            (
                dataset["id"], dataset["title"], dataset["year"], dataset["period"], source_url, compact(sources),
                compact(variables), digest(dataset), "", now(), None,
            ),
            observed,
            {key: value for key, value in dataset.items() if key not in {"id", "title", "year", "period", "sourceUrl", "variables", "rows"}},
        )
        print(f"Importado archivo inicial {dataset['id']}: {len(observed):,} observaciones.")


def atomic_write(path, writer):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        try:
            writer(handle)
            handle.flush()
            os.fsync(handle.fileno())
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)


def export(db, destination):
    datasets = []
    manifest = {"catalogo": CATALOG_URL, "generado_utc": now(), "publicaciones": [], "seguimiento": []}
    manifest["seguimiento"] = [dict(row) for row in db.execute("SELECT * FROM catalogo ORDER BY serie, anio")]
    for publication in db.execute("SELECT * FROM publicacion ORDER BY anio DESC, id"):
        variables = json.loads(publication["variables_json"])
        by_geography = defaultdict(dict)
        count = 0
        for record in db.execute(
            "SELECT * FROM observacion WHERE publicacion_id=? ORDER BY geoid", (publication["id"],)
        ):
            by_geography[record["geoid"]][record["variable_id"]] = (record["valor"], record["margen_error"])
            count += 1
        metadata = db.execute(
            "SELECT contenido FROM metadatos_publicacion WHERE publicacion_id=?", (publication["id"],)
        ).fetchone()
        datasets.append({
            **(json.loads(metadata["contenido"]) if metadata else {}),
            "id": publication["id"], "title": publication["titulo"], "year": publication["anio"],
            "period": publication["periodo"], "sourceUrl": publication["fuente_url"],
            "verifiedAt": publication["verificado_utc"], "variables": variables,
            "rows": {
                code: [values[var["id"]] for var in variables] for code, values in by_geography.items()
            },
        })
        manifest["publicaciones"].append({
            "id": publication["id"], "catalogo_id": publication["catalogo_id"],
            "verificado_utc": publication["verificado_utc"], "geografias": len(by_geography),
            "observaciones": count, "fuentes": json.loads(publication["consultas_json"]),
        })
    atomic_write(destination / "observations.json", lambda handle: handle.write(compact({"datasets": datasets})))
    atomic_write(destination / "manifest.json", lambda handle: json.dump(manifest, handle, ensure_ascii=False, indent=2))

    def write_csv(handle):
        writer = csv.writer(handle)
        handle.write("\ufeff")
        writer.writerow((
            "producto", "año", "periodo", "geoid", "variable", "valor", "margen_error",
            "valor_original", "margen_original", "fuente", "verificado_utc",
        ))
        writer.writerows(db.execute(
            """SELECT publicacion_id, anio, periodo, geoid, variable_id, valor, margen_error,
            valor_original, margen_original, fuente_url, verificado_utc
            FROM observacion JOIN publicacion ON publicacion.id = observacion.publicacion_id
            ORDER BY anio DESC, publicacion_id, geoid, variable_id"""
        ))

    atomic_write(destination / "observaciones.csv", write_csv)
    print(f"Exportadas {len(datasets)} publicaciones en {destination}.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=ROOT / "observatorio.sqlite")
    parser.add_argument("--config", type=Path, default=ROOT / "series.json")
    parser.add_argument("--seed", type=Path, help="Archivo inicial compatible con observations.json.")
    parser.add_argument("--export", type=Path, metavar="CARPETA")
    parser.add_argument("--year", type=int, action="append", help="Selecciona un año; se puede repetir.")
    parser.add_argument("--series", action="append", help="Código Census, p. ej. acs/acs5; se puede repetir.")
    parser.add_argument("--history", action="store_true", help="Importa todos los periodos disponibles de las series.")
    parser.add_argument("--catalog-only", action="store_true", help="Actualiza el catálogo sin importar datos.")
    parser.add_argument("--offline", action="store_true", help="Usa la base local y omite consultas en línea.")
    parser.add_argument("--refresh", action="store_true", help="Comprueba los datos aunque no cambien los metadatos.")
    args = parser.parse_args()
    specs = json.loads(args.config.read_text(encoding="utf-8"))
    if args.series and set(args.series) - (specs.keys() | {PEP_SERIES}):
        parser.error("Las series seleccionadas deben estar configuradas en series.json.")
    args.db.parent.mkdir(parents=True, exist_ok=True)
    failed = False
    with sqlite3.connect(args.db, timeout=30) as db:
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        db.executescript(SCHEMA)
        if args.seed:
            seed(db, args.seed)
        if not args.offline:
            update_catalog(db)
            if not args.catalog_only:
                for entry, spec in catalog_rows(db, specs, args.year, args.series, args.history):
                    try:
                        acquire(db, entry, spec, os.environ.get("CENSUS_API_KEY"), args.refresh)
                    except (OSError, ValueError, RuntimeError) as exc:
                        failed = True
                        print(f"Pendiente {entry['serie']} {entry['anio']}: {exc}", file=sys.stderr)
                if not args.series or PEP_SERIES in args.series:
                    try:
                        update_pep(db, args.year, args.refresh)
                    except (OSError, ValueError, RuntimeError) as exc:
                        failed = True
                        print(f"Pendiente {PEP_SERIES}: {exc}", file=sys.stderr)
        if args.export:
            with db:
                db.execute("BEGIN")
                export(db, args.export)
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, RuntimeError, sqlite3.Error) as exc:
        sys.exit(str(exc))
