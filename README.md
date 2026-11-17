# Territorio 78 · sitio y actualización censal automática

Portal independiente de noticias de planificación de Puerto Rico. Autor: Plan. David J. Rodríguez Castro, MP, PPL.

## Contenido

| Carpeta | Qué contiene |
|---|---|
| `sitio/` | Lo que publica Netlify: `index.html` (Territorio 78) y `censo/` (Observatorio Censal) |
| `repositorio/` | Base `observatorio.sqlite`, `actualizar.py` (consulta al U.S. Census Bureau), `series.json`, `municipios.json` y `publicar.py` |
| `.github/workflows/censo-diario.yml` | Tarea diaria (6:20 a. m., hora de Puerto Rico) que actualiza los datos y los publica |

Las noticias, la reforma de permisos, los proyectos y el repositorio de planes se leen en vivo desde Supabase; no dependen de este repositorio. Este repositorio mantiene al día los datos censales.

## Cómo funciona la actualización

1. GitHub Actions ejecuta `python repositorio/actualizar.py --export exportacion`. El programa revisa el catálogo oficial del Censo, descarga las ediciones nuevas o revisadas de cada serie configurada y valida territorio, municipios, variables y códigos geográficos.
2. `publicar.py` copia la exportación a `sitio/censo/data/` solo si es válida (incluye la población de Puerto Rico en la edición PEP vigente). Si una serie falla, se conserva su última carga válida.
3. Si los datos cambiaron, el flujo guarda el cambio en el repositorio. Netlify detecta el cambio en `sitio/` y vuelve a publicar en uno o dos minutos.
4. La pestaña **Censo** de Territorio 78 y el Observatorio leen `censo/data/observations.json`, de modo que las cifras, gráficas y tablas se actualizan sin tocar el HTML. `estado.json` registra la fecha de revisión y las publicaciones nuevas o cambiadas.

Los domingos, la tarea añade `--refresh` para comprobar revisiones de archivos ya importados.

## Puesta en marcha (una sola vez)

1. **Netlify:** *Add new site → Import an existing project → GitHub*, elige este repositorio. Netlify toma la configuración de `netlify.toml` (carpeta de publicación `sitio`, sin comando de compilación). Si ya tienes el sitio creado por arrastre, en *Site configuration → Build & deploy → Link repository* lo enlazas sin cambiar la dirección.
2. **Clave del Censo (opcional):** *Settings → Secrets and variables → Actions → New repository secret*, nombre `CENSUS_API_KEY`. Se solicita gratis en https://api.census.gov/data/key_signup.html. No se guarda nunca en la base, el sitio ni las descargas.
3. **Prueba:** *Actions → Actualización censal diaria → Run workflow*. El resumen de la ejecución indica si hubo datos nuevos y si alguna serie quedó pendiente.

## Fuentes

U.S. Census Bureau: Censo decenal, American Community Survey (1 y 5 años), Population Estimates Program, Community Resilience Estimates, Building Permits Survey, County Business Patterns y Censo Económico. Cada publicación conserva su URL oficial, su periodo y la fecha de verificación.
