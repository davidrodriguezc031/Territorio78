"""Copia una exportación verificada de actualizar.py al sitio publicado.

Uso: python repositorio/publicar.py EXPORTACION SITIO_DATA

- EXPORTACION: carpeta creada con `actualizar.py --export`.
- SITIO_DATA: carpeta `sitio/censo/data`.

Conserva los campos que usa el sitio (fecha de consulta y notas), escribe
estado.json con la fecha de revisión y las publicaciones nuevas o cambiadas,
y deja el resto de los archivos del sitio como estaban. Devuelve 0 siempre que
la exportación sea válida; si no lo es, no toca el sitio y devuelve 2.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def cargar(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def main():
    exportacion, sitio = Path(sys.argv[1]), Path(sys.argv[2])
    nuevo = cargar(exportacion / "observations.json")
    if not nuevo or not isinstance(nuevo.get("datasets"), list) or len(nuevo["datasets"]) < 10:
        print("Exportación incompleta: el sitio conserva la última carga válida.", file=sys.stderr)
        return 2
    previo = cargar(sitio / "observations.json") or {"datasets": []}
    antes = {d["id"]: d for d in previo["datasets"]}

    hoy = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    nuevas, cambiadas = [], []
    for d in nuevo["datasets"]:
        p = antes.get(d["id"])
        verificado = (d.get("verifiedAt") or "")[:10]
        d["retrievedAt"] = verificado or (p or {}).get("retrievedAt") or d.get("accessed") or hoy
        if not d.get("description"):
            d["description"] = d.get("notes") or (p or {}).get("description") or ""
        if p is None:
            nuevas.append(d["id"])
        elif p.get("rows") != d.get("rows"):
            cambiadas.append(d["id"])

    # Validación mínima: Puerto Rico (GEOID 72) debe tener población en la última edición PEP.
    pep = sorted((d for d in nuevo["datasets"] if d["id"].startswith("pep-")), key=lambda d: d["id"])
    if not pep or not (pep[-1].get("rows") or {}).get("72"):
        print("La exportación no contiene la población de Puerto Rico: no se publica.", file=sys.stderr)
        return 2

    # Las cifras solo se reescriben cuando hay publicaciones nuevas o cambiadas (o en la primera carga);
    # así una revisión sin novedades no cambia la fecha de consulta de cada publicación.
    if nuevas or cambiadas or not previo["datasets"]:
        texto = json.dumps(nuevo, ensure_ascii=False, separators=(",", ":"))
        (sitio / "observations.json").write_text(texto, encoding="utf-8")
        manifiesto = exportacion / "manifest.json"
        if manifiesto.exists():
            (sitio / "manifest.json").write_text(manifiesto.read_text(encoding="utf-8"), encoding="utf-8")
    estado = {
        "revisado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "publicaciones": len(nuevo["datasets"]),
        "nuevas": nuevas,
        "cambiadas": cambiadas,
    }
    (sitio / "estado.json").write_text(json.dumps(estado, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"publicaciones={len(nuevo['datasets'])} nuevas={len(nuevas)} cambiadas={len(cambiadas)}")
    if nuevas or cambiadas:
        print("Cambios: " + ", ".join(nuevas + cambiadas))
    return 0


if __name__ == "__main__":
    sys.exit(main())
