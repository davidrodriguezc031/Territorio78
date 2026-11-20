"""Análisis demográfico del Observatorio Censal de Puerto Rico.

Uso: python repositorio/demografia.py sitio/censo/data/demografia.json [--refresh]

Fuentes oficiales (se descargan en cada ejecución; la tabla de vida se guarda filtrada):
  - U.S. Census Bureau, Population Estimates Program (PEP), NST-EST{V}-ALLDATA:
    población y componentes del cambio de Puerto Rico (nacimientos, defunciones, migración neta, residual).
  - U.S. Census Bureau, PEP, CC-EST{V}-AGESEX-72: población por grupos de edad y sexo de cada municipio.
  - Naciones Unidas, DESA, World Population Prospects 2024: tabla de vida abreviada de Puerto Rico (LocID 630).

Métodos (ver la sección «Análisis demográfico» del sitio):
  - Ecuación compensadora: P(t+1) − P(t) = B − D + M + residual (Census Bureau, metodología PEP V2025).
  - Tasas por 1,000 habitantes: componente / promedio de la población al inicio y al final del año (definición PEP).
  - Migración neta por municipio, 2020–2025: método de supervivencia hacia adelante con relaciones de
    supervivencia de la tabla de vida (Naciones Unidas, Manual VI, 1970; Siegel y Swanson, 2004):
        M(x+5) = P(x+5, t+5) − S(x) · P(x, t),  S(x) = 5L(x+5) / 5L(x);  grupo abierto S = T(85) / T(80).
    Estima la migración de la población de 5 años o más al final del periodo, por sexo.
  - Crecimiento exponencial: r = ln(P2 / P1) / t (Preston, Heuveline y Guillot, 2001).
  - Índices de estructura por edad: dependencia total, juvenil y de vejez; envejecimiento; razón de masculinidad.
"""
import csv
import gzip
import io
import json
import math
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://www2.census.gov/programs-surveys/popest/datasets"
WPP_URL = "https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_Life_Table_Abridged_Medium_1950-2023.csv.gz"
CACHE = Path(__file__).with_name("fuentes")
GRUPOS = ["AGE04", "AGE59", "AGE1014", "AGE1519", "AGE2024", "AGE2529", "AGE3034", "AGE3539", "AGE4044",
          "AGE4549", "AGE5054", "AGE5559", "AGE6064", "AGE6569", "AGE7074", "AGE7579", "AGE8084", "AGE85PLUS"]
ETIQ = ["0–4", "5–9", "10–14", "15–19", "20–24", "25–29", "30–34", "35–39", "40–44", "45–49", "50–54",
        "55–59", "60–64", "65–69", "70–74", "75–79", "80–84", "85+"]
YEARCODE = {2: 2020, 3: 2021, 4: 2022, 5: 2023, 6: 2024, 7: 2025}
LT_YEARS = (2020, 2021, 2022, 2023)  # tablas de vida estimadas dentro del periodo jul. 2020 – jul. 2025


def get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ObservatorioCensalPR/1.0"})
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                raise
            print(f"reintento {i + 1} {url}: {e}", file=sys.stderr)
            time.sleep(5 * (i + 1))


def vintage_files():
    """Busca la edición (vintage) más reciente publicada, desde el año en curso hacia atrás."""
    year = datetime.now(timezone.utc).year
    for v in range(year, 2024, -1):
        st = f"{BASE}/2020-{v}/state/totals/NST-EST{v}-ALLDATA.csv"
        ag = f"{BASE}/2020-{v}/puerto-rico/asrh/cc-est{v}-agesex-72.csv"
        try:
            a = get(st, tries=1)
            b = get(ag, tries=1)
            return v, st, ag, a, b
        except Exception:  # noqa: BLE001
            continue
    raise SystemExit("No se encontró una edición PEP disponible.")


def rows(raw):
    return list(csv.DictReader(io.StringIO(raw.decode("latin-1").lstrip("﻿"))))


def life_table(refresh):
    CACHE.mkdir(exist_ok=True)
    f = CACHE / "wpp2024_tabla_vida_abreviada_PRI.csv"
    if refresh or not f.exists():
        raw = get(WPP_URL)
        out = io.StringIO()
        with gzip.open(io.BytesIO(raw), "rt", encoding="utf-8") as g:
            rd = csv.DictReader(g)
            wr = csv.DictWriter(out, fieldnames=rd.fieldnames)
            wr.writeheader()
            for r in rd:
                if r.get("ISO3_code") == "PRI" or r.get("LocID") == "630":
                    wr.writerow(r)
        f.write_text(out.getvalue(), encoding="utf-8")
    return list(csv.DictReader(io.StringIO(f.read_text(encoding="utf-8"))))


def survival(lt, sex):
    """Relaciones de supervivencia a 5 años, promedio de LT_YEARS. sex: 'Male'/'Female'/'Total'."""
    per_year = []
    for y in LT_YEARS:
        L = {}
        for r in lt:
            if r["Time"] == str(y) and r["Sex"] == sex:
                L[int(float(r["AgeGrpStart"]))] = float(r["Lx"])
        if not L:
            continue
        L5 = {0: L[0] + L[1]}
        for x in range(5, 81, 5):
            L5[x] = L[x]
        T = lambda a: sum(v for k, v in L.items() if k >= a)  # noqa: E731
        S = [L5[x + 5] / L5[x] for x in range(0, 80, 5)]  # 0–4→5–9 … 75–79→80–84 (16 relaciones)
        S.append(T(85) / T(80))  # 80+ → 85+
        per_year.append(S)
    if not per_year:
        raise SystemExit(f"Tabla de vida sin datos para {sex}.")
    return [sum(s[i] for s in per_year) / len(per_year) for i in range(len(per_year[0]))]


def migracion(p1, p2, S):
    """p1, p2: listas de 18 grupos (0–4 … 85+). Devuelve migración neta por grupo de edad al final (5–9 … 85+)."""
    m = []
    for i in range(1, 18):
        if i < 17:
            esperado = S[i - 1] * p1[i - 1]
        else:
            esperado = S[16] * (p1[16] + p1[17])
        m.append(p2[i] - esperado)
    return m


def main():
    out_path = Path(sys.argv[1])
    refresh = "--refresh" in sys.argv
    v, st_url, ag_url, st_raw, ag_raw = vintage_files()

    # 1) Componentes oficiales de Puerto Rico
    pr = next(r for r in rows(st_raw) if r["STATE"] == "72")
    years = list(range(2020, v + 1))
    g = lambda k, y: int(float(pr[f"{k}{y}"])) if pr.get(f"{k}{y}") not in (None, "") else None  # noqa: E731
    comp = {"anios": years, "base_abril_2020": int(pr["ESTIMATESBASE2020"]),
            "poblacion": [g("POPESTIMATE", y) for y in years],
            "nacimientos": [g("BIRTHS", y) for y in years], "defunciones": [g("DEATHS", y) for y in years],
            "crecimiento_natural": [g("NATURALCHG", y) for y in years],
            "migracion_internacional": [g("INTERNATIONALMIG", y) for y in years],
            "migracion_neta": [g("NETMIG", y) for y in years], "residual": [g("RESIDUAL", y) for y in years],
            "cambio": [int(float(pr[f"NPOPCHG_{y}"])) for y in years]}
    # Tasas por 1,000 (definición PEP): componente / promedio de la población al 1 de julio inicial y final.
    tasas = {}
    for k in ("nacimientos", "defunciones", "crecimiento_natural", "migracion_neta"):
        tasas[k] = [None] + [round(1000 * comp[k][i] / ((comp["poblacion"][i - 1] + comp["poblacion"][i]) / 2), 2)
                             for i in range(1, len(years))]
    comp["tasas_por_mil"] = tasas
    comp["tasas_oficiales"] = {k: [None] + [float(pr[f"R{n}{y}"]) if pr.get(f"R{n}{y}") else None for y in years[1:]]
                               for k, n in (("nacimientos", "BIRTH"), ("defunciones", "DEATH"),
                                            ("crecimiento_natural", "NATURALCHG"), ("migracion_neta", "NETMIG"))}
    # Comprobación de la ecuación compensadora año a año (jul.–jun.)
    comp["cierre"] = [comp["cambio"][i] - (comp["crecimiento_natural"][i] + comp["migracion_neta"][i] + (comp["residual"][i] or 0))
                      for i in range(len(years))]

    # 2) Población por edad y sexo por municipio
    ag = rows(ag_raw)
    lt = life_table(refresh)
    S = {"m": survival(lt, "Male"), "f": survival(lt, "Female")}
    munis = {}
    for r in ag:
        yc = int(r["YEAR"])
        if yc not in YEARCODE:
            continue
        geo = "72" + r["MUNICIPIO"].zfill(3)
        d = munis.setdefault(geo, {"nombre": r["NAME"].replace(" Municipio", ""), "anios": {}})
        d["anios"][YEARCODE[yc]] = {
            "pob": int(r["POPESTIMATE"]), "h": int(r["POPEST_MALE"]), "m": int(r["POPEST_FEM"]),
            "edad_mediana": float(r["MEDIAN_AGE_TOT"]),
            "gh": [int(r[f"{k}_MALE"]) for k in GRUPOS], "gm": [int(r[f"{k}_FEM"]) for k in GRUPOS]}
    t1, t2 = 2020, v
    span = t2 - t1
    tot = {"nm": 0.0, "nm_h": 0.0, "nm_m": 0.0, "edad": [0.0] * 17}
    for geo, d in munis.items():
        a, b = d["anios"][t1], d["anios"][t2]
        if span == 5:
            mh = migracion(a["gh"], b["gh"], S["m"])
            mm = migracion(a["gm"], b["gm"], S["f"])
            edad = [round(x + y, 1) for x, y in zip(mh, mm)]
            nm = sum(edad)
            pbar = (a["pob"] + b["pob"]) / 2
            d["migracion"] = {"periodo": f"{t1}–{t2}", "neta": round(nm), "hombres": round(sum(mh)), "mujeres": round(sum(mm)),
                              "por_edad": edad, "tasa_anual_por_mil": round(1000 * nm / (span * pbar), 2)}
            tot["nm"] += nm; tot["nm_h"] += sum(mh); tot["nm_m"] += sum(mm)
            tot["edad"] = [p + q for p, q in zip(tot["edad"], edad)]
        for y, e in d["anios"].items():
            gr = [h + m for h, m in zip(e["gh"], e["gm"])]
            j, adul, may = sum(gr[0:3]), sum(gr[3:13]), sum(gr[13:18])
            e["ind"] = {"dep_total": round(100 * (j + may) / adul, 1), "dep_juvenil": round(100 * j / adul, 1),
                        "dep_vejez": round(100 * may / adul, 1), "envejecimiento": round(100 * may / j, 1) if j else None,
                        "masculinidad": round(100 * e["h"] / e["m"], 1), "pct_65": round(100 * may / e["pob"], 1),
                        "pct_0_14": round(100 * j / e["pob"], 1)}
        d["crecimiento"] = {"periodo": f"{t1}–{t2}", "r_anual_pct": round(100 * math.log(b["pob"] / a["pob"]) / span, 3)}
        r = d["crecimiento"]["r_anual_pct"] / 100
        d["crecimiento"]["anios_mitad_o_doble"] = round(math.log(2) / abs(r), 1) if r else None

    # 3) Validación: suma municipal frente a la migración neta oficial del PEP para Puerto Rico
    idx = {y: i for i, y in enumerate(years)}
    oficial = sum(comp["migracion_neta"][idx[y]] for y in range(t1 + 1, t2 + 1))
    val = {"periodo": f"1 jul. {t1} – 1 jul. {t2}", "suma_municipios_5_mas": round(tot["nm"]),
           "hombres": round(tot["nm_h"]), "mujeres": round(tot["nm_m"]),
           "pep_migracion_neta_oficial": oficial,
           "pep_nacimientos": sum(comp["nacimientos"][idx[y]] for y in range(t1 + 1, t2 + 1)),
           "pep_defunciones": sum(comp["defunciones"][idx[y]] for y in range(t1 + 1, t2 + 1)),
           "por_edad_pr": [round(x) for x in tot["edad"]],
           "nota": "La suma municipal estima la migración de la población de 5 años o más al final del periodo; "
                   "la cifra oficial incluye a todas las edades y a los nacidos durante el periodo."}
    doc = {"generado": datetime.now(timezone.utc).isoformat(timespec="seconds"), "vintage": v,
           "grupos_edad": ETIQ,
           "fuentes": {"componentes": st_url, "edad_sexo": ag_url, "tabla_vida": WPP_URL,
                       "tabla_vida_anios": list(LT_YEARS)},
           "supervivencia": {"hombres": [round(x, 5) for x in S["m"]], "mujeres": [round(x, 5) for x in S["f"]]},
           "pr": comp, "validacion": val, "municipios": munis}
    # Solo se reescribe cuando cambian los datos (no por la fecha de generación).
    try:
        prev = json.loads(out_path.read_text(encoding="utf-8"))
        if {k: x for k, x in prev.items() if k != "generado"} == json.loads(json.dumps({k: x for k, x in doc.items() if k != "generado"}, ensure_ascii=False)):
            print("Sin cambios en los datos demográficos.")
            return
    except (OSError, ValueError):
        pass
    out_path.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"vintage={v} municipios={len(munis)} migracion_5mas={val['suma_municipios_5_mas']} oficial={oficial}")


if __name__ == "__main__":
    main()
