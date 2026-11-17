# Repositorio censal de Puerto Rico

`observatorio.sqlite` contiene las observaciones del prototipo y un inventario de series potencialmente pertinentes a Puerto Rico. El repositorio conserva el producto, el año de referencia, la geografía, las variables, la procedencia y la fecha de consulta. Se puede abrir con DB Browser for SQLite, DBeaver o el módulo `sqlite3` de Python.

## Operación

Requiere Python 3.10 o superior y acceso HTTPS a los dominios del U.S. Census Bureau. Los comandos se ejecutan desde esta carpeta. La actualización ordinaria revisa el catálogo y descarga la edición más reciente disponible de cada serie configurada.

```sh
python actualizar.py --export exportacion
```

Para comprobar una serie o un año concreto se pueden repetir `--series` y `--year`. En PEP, `--year` selecciona la edición completa. El proceso conserva las ediciones PEP separadas para impedir que se confundan cifras revisadas con cifras de otra publicación.

```sh
python actualizar.py --series acs/acs5 --year 2024 --export exportacion
python actualizar.py --series pep/municipios --year 2025 --export exportacion
python actualizar.py --catalog-only --export exportacion
python actualizar.py --offline --export exportacion
```

`--history` recorre los años que aparecen en el catálogo de las series configuradas. `--refresh` vuelve a consultar archivos de una edición aunque sus metadatos sigan iguales. La actualización ordinaria usa los archivos abiertos del ACS a partir de 2021. Los datos de la API de Census requieren una clave y se habilitan al definir `CENSUS_API_KEY` en el entorno. Mantén la clave fuera de la base, el sitio y los archivos descargables.

Para recuperar la base desde un archivo de observaciones del prototipo y exportar sin conexión:

```sh
python actualizar.py --offline --seed observations.json --export exportacion
```

En un servidor, el programador de tareas puede ejecutar el comando ordinario en un directorio persistente. Una ejecución semanal con `--refresh` permite verificar revisiones de archivos existentes. Usa el mismo archivo SQLite en cada ejecución para conservar el historial. La carpeta de exportación contiene JSON para el sitio, CSV compatible con Excel y un manifiesto con las fuentes. El operador del sitio puede publicar las salidas de una ejecución verificada. El programa local puede señalar actualizaciones pendientes en su salida y conserva la última carga válida si una descarga o una validación falla.

## Cobertura y comprobaciones

| Flujo | Cobertura | Comprobación |
|---|---|---|
| Catálogo de Census API | Años disponibles en el catálogo y familias que pueden contener datos de Puerto Rico | Clasifica la mención explícita y las entradas cuya cobertura de Puerto Rico requiere revisión. Guarda alta, modificación, ausencia y fecha de comprobación. |
| Encuesta sobre la Comunidad · 5 años | Puerto Rico, los 78 municipios y los barrios publicados como divisiones de condado para las tablas seleccionadas | Comprueba el territorio, la cobertura municipal, las variables y los códigos geográficos. |
| Encuesta sobre la Comunidad · 1 año | Puerto Rico y geografías elegibles por tamaño en los tabulados estándar | Conserva la cobertura que publicó Census para cada edición. Los municipios sin estimado quedan sin observación. |
| PEP · población total | Puerto Rico y los 78 municipios, a partir de 2020 en la edición vigente | Lee la hoja oficial, coteja nombres con FIPS TIGER y verifica que los municipios sumen el total insular en cada año. |
| Censo decenal | Archivo inicial verificado y conectores de API para Summary File 1 y Redistribución electoral 2020 en adelante | Conserva la edición y los códigos publicados. Las variables configuradas varían según el producto. |

En los estimados ACS, el margen de error corresponde al 90 % de confianza. Los códigos especiales identificados en los archivos de ACS se guardan como valores originales y se convierten en nulos para visualización y análisis. Un nulo representa una cifra ausente o inaplicable. Cuenta los ceros únicamente cuando fueron publicados como cero. Los periodos ACS de cinco años solapados comparten observaciones y los ingresos nominales se expresan en dólares del año de referencia.

La búsqueda en el catálogo es más amplia que la carga automática de cifras. Para incorporar tablas de otros productos como Census Económico, PUMS, TIGER detallado o documentos históricos digitalizados se usa su fuente específica, con una comprobación de formato y cobertura. La selección de variables ACS se amplía en `series.json` usando el ID oficial de tabla, línea, tipo de estimado y margen de error. Consulta la documentación de llamadas geográficas para confirmar el nivel de cada producto.

## Qué contiene SQLite

| Tabla | Contenido |
|---|---|
| `catalogo` | Fuentes oficiales en seguimiento, señal de pertinencia para Puerto Rico y fecha de consulta |
| `publicacion` | Producto, año, periodo, versión de metadatos y manifiesto de consultas |
| `metadatos_publicacion` | Detalles adicionales del producto como notas, metodología y nombres geográficos cuando la fuente inicial los incluye |
| `observacion` | Una fila por publicación, geografía y variable, con valor, margen y valores originales cuando se han importado |
| `cambios` | Registro de altas, correcciones, reincorporaciones y posibles retiros del catálogo |

```sql
SELECT p.id, p.periodo, o.geoid, o.variable_id, o.valor, o.margen_error, p.fuente_url
FROM observacion AS o
JOIN publicacion AS p ON p.id = o.publicacion_id
WHERE o.geoid IN ('72', '72001') AND o.variable_id = 'population'
ORDER BY p.anio DESC, p.id, o.geoid;
```

Un GEOID de dos dígitos identifica a Puerto Rico, uno de cinco dígitos a un municipio y uno de diez dígitos a un barrio o barrio-pueblo. Otros productos pueden usar geografías distintas como subbarrios, lugares censales y PUMA. Conserva las definiciones de la edición consultada al comparar años.

## Fuentes oficiales

- [Catálogo de Census Data API](https://api.census.gov/data.json)
- [Documentación del ACS Summary File](https://www.census.gov/programs-surveys/acs/data/summary-file/getting-started.html)
- [Geografías del ACS de cinco años](https://api.census.gov/data/2024/acs/acs5/geography.html)
- [Ejemplos de uso de la API y solicitud de clave](https://api.census.gov/data/2024/acs/acs5/examples.html)
- [Totales de población de los municipios de Puerto Rico](https://www.census.gov/data/datasets/time-series/demo/popest/2020s-total-puerto-rico-municipios.html)
- [Límites TIGER cartográficos de 2025](https://www.census.gov/geographies/mapping-files/2025/geo/carto-boundary-file.html)
