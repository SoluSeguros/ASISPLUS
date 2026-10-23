/**
 * novedades.js
 * Aviso de "qué cambió" para el asistente cuando la app se actualiza.
 *
 * El asistente trabaja en la vía y la app se actualiza sola: si algo cambia de
 * sitio o de comportamiento, se entera en el peor momento posible. Este modal
 * se abre UNA vez por versión nueva y le cuenta, en su idioma, qué cambió y qué
 * tiene que revisar.
 *
 * Cómo agregar novedades al publicar una versión: añade una entrada NUEVA al
 * principio de NOVEDADES con la versión de js/version.js. Si una versión no
 * cambia nada que el asistente note (un arreglo interno, por ejemplo), NO la
 * agregues: el aviso pierde su valor si aparece por cosas que no le importan.
 *
 * Si el cambio solo le sirve a algunos roles (por ejemplo, algo del portal de
 * empresa), ponle `roles: ['empresa', 'admin']` a la entrada y solo esos lo
 * verán. Sin `roles`, la novedad es para todos. Existe para no interrumpir al
 * asistente en la vía con un aviso sobre una pantalla que él no abre.
 */

const NOVEDADES_KEY = 'asisplus-novedades-vista';

// De la más nueva a la más vieja.
const NOVEDADES = [
  {
    version: '2.36.0',
    titulo: 'El formulario de Equidad, adentro',
    roles: ['asistente', 'gestor', 'admin'],
    puntos: [
      {
        icono: '📝',
        titulo: 'Ya no hay que abrirlo aparte',
        texto: 'La declaración de Equidad es ahora una pantalla más de ASIS PLUS: está en el menú como <b>Formulario Equidad</b> y, dentro de cada caso, debajo de los datos del siniestro. Misma sesión, mismo celular, sin acordarse del enlace.'
      },
      {
        icono: '⚡',
        titulo: 'Llega con los datos del caso puestos',
        texto: 'Si lo abres desde el caso, el formulario ya trae la fecha, la hora, el lugar, la placa, el conductor con su cédula y teléfono, los terceros con su placa y sus daños, y los lesionados. En un caso real quedaron <b>39 casillas</b> diligenciadas solas. Lo que tú escribas manda: si ya habías llenado una casilla, no se toca.'
      },
      {
        icono: '📴',
        titulo: 'Funciona sin señal',
        texto: 'El formulario, el formato de Equidad en blanco y lo que se necesita para armar el PDF quedan guardados en el celular junto con el resto de la app. En la vía, donde no hay señal, es donde más se necesita.'
      },
      {
        icono: '↩️',
        titulo: 'Y se vuelve al mismo caso',
        texto: 'El botón <b>← ASIS PLUS</b> del encabezado te devuelve al caso que estabas atendiendo, no al menú.'
      }
    ]
  },
  {
    version: '2.35.0',
    titulo: 'Todas las fechas en día/mes/año',
    puntos: [
      {
        icono: '📅',
        titulo: 'Como se escriben acá',
        texto: 'En toda la app —el detalle del caso, la bandeja, la tabla del Registro de Asistencias, seguridad vial, los contratos y las descargas a Excel— las fechas se ven ahora como <b>18/07/2026</b>. Antes, los 2.707 casos que venían del sistema viejo se mostraban al revés (mes/día/año): decía «7/18/2026», y en los días del 1 al 12 eso se leía mal sin que nada avisara. «3/5/2026» parecía 3 de mayo y era el 5 de marzo.'
      },
      {
        icono: '🔍',
        titulo: 'Y el buscador entiende lo que ves',
        texto: 'Podés copiar la fecha tal como aparece en pantalla y buscarla. Funciona igual escribiendo 18/07/2026 o 18/7/2026.'
      },
      {
        icono: '🛠️',
        titulo: 'Un día de corrimiento, corregido',
        texto: 'Los casos registrados con esta app se guardan como 2026-08-18, y al contarlos el programa los tomaba en hora de Londres: salían con un día menos. Eran 184 casos, y los del primero de mes caían en el mes anterior. Ya no: la fecha que muestra la lista es la misma con la que cuentan el dashboard, la ficha de siniestralidad y los días en proceso de seguridad vial.'
      }
    ]
  },
  {
    version: '2.34.0',
    titulo: 'La estadística de infracciones, al detalle',
    roles: ['empresa', 'admin'],
    puntos: [
      {
        icono: '📌',
        titulo: 'La conclusión, en una frase',
        texto: 'Arriba de los gráficos hay una línea que dice directamente lo que hay que saber: el mes que más repite, el día de la semana, la franja horaria, el código y el vehículo. Con las 230 cargadas dice que el peor mes es <b>febrero</b> (36) y el peor día el <b>miércoles</b> (49).'
      },
      {
        icono: '🗓️',
        titulo: 'En qué mes y qué día',
        texto: 'Dos paneles nuevos: <b>En qué mes del año</b> —los cuatro años juntos, para ver la temporada— y <b>Qué día de la semana</b>. El día sale de la fecha, igual que lo traía el Excel (se comprobó: 230 de 230 coinciden).'
      },
      {
        icono: '👆',
        titulo: 'Todo gráfico filtra al tocarlo',
        texto: 'Tocá una columna de febrero y la lista de abajo queda con esas 36. Tocá un año y entra a sus doce meses. Tocá un código, una placa o un conductor y va al buscador. Se pueden sumar (junio + viernes), lo que está filtrando se ve marcado y arriba aparece un botón con una <b>✕</b> para quitarlo. Volver a tocar lo mismo también lo quita.'
      },
      {
        icono: '🕐',
        titulo: 'Y la hora, de aquí en adelante',
        texto: 'El formulario tiene ahora un campo <b>Hora</b> (opcional). El Excel que se importó no traía hora —17 columnas y ninguna de hora—, así que las 230 viejas están sin ella y el panel lo dice en vez de inventar una franja. Lo que registres o corrijas con hora empieza a llenar el panel de franjas y el de hora exacta.'
      },
      {
        icono: '📈',
        titulo: 'Comparado con el año anterior',
        texto: 'Al elegir un año, la tarjeta del total muestra si subió o bajó frente al año anterior. Si ese año no está en los datos lo dice, en vez de mostrar un porcentaje sin base.'
      }
    ]
  },
  {
    version: '2.33.0',
    titulo: 'Por mes en el historial, y los gráficos por empresa',
    roles: ['empresa', 'admin'],
    puntos: [
      {
        icono: '📆',
        titulo: 'Los doce meses, con su total',
        texto: 'Debajo de los botones de empresa hay una segunda fila con los doce meses y cuántos casos tiene cada uno. Tocá uno y la lista queda solo con los de ese mes. Sin elegir año suman todos los años —sirve para ver la temporada, por ejemplo que marzo y junio son los peores—; con un año elegido son los meses de ese año.'
      },
      {
        icono: '🔀',
        titulo: 'Empresa y mes se suman',
        texto: 'Podés pedir «COOINVETRANS en diciembre». Cada fila de botones cuenta sin su propio filtro y con el de la otra, así que los números son siempre lo que vas a ver al tocar: si elegís diciembre, los botones de empresa pasan a mostrar cuántos tuvo cada una <b>en diciembre</b>.'
      },
      {
        icono: '📊',
        titulo: 'El dashboard también se puede ver empresa por empresa',
        texto: 'Arriba de los gráficos hay botones con el total de cada empresa en el periodo. Al elegir una se recalcula <b>todo</b>: los meses, la gravedad, los vehículos y conductores que más repiten, la franja horaria y el día de la semana. La tasa por 100 vehículos pasa a dividir por el parque de esa empresa, que es lo correcto: con la flota del grupo entero salía una fracción de lo real.'
      }
    ]
  },
  {
    version: '2.32.0',
    titulo: 'Los siniestros, separados por empresa',
    roles: ['empresa', 'admin'],
    puntos: [
      {
        icono: '🏢',
        titulo: 'Arriba del historial, el total de cada empresa',
        texto: 'Si tu usuario ve varias compañías, el historial ya no las mezcla en una sola bolsa: hay un botón por empresa con <b>su</b> número de casos, y al tocarlo la lista queda solo con los de ella. Los totales siempre suman lo que estás viendo, así que si además filtras por año o gravedad, cada número se ajusta.'
      },
      {
        icono: '🏷️',
        titulo: 'Cada caso dice de quién es',
        texto: 'Viendo «Todas», cada fila lleva el nombre de la empresa a la derecha. Cuando ya elegiste una, el nombre desaparece: sería repetirlo en las 50 filas de la página.'
      },
      {
        icono: '📊',
        titulo: 'Y en el dashboard, un panel aparte',
        texto: 'Debajo de «Siniestros por mes» hay un panel <b>🏢 Siniestros por empresa</b> con el reparto del periodo. Al lado de cada una va su tasa <b>por 100 vehículos al mes</b> calculada con su propio parque, que es lo único que las hace comparables: la empresa con más buses siempre tiene más casos.'
      }
    ]
  },
  {
    version: '2.31.0',
    titulo: 'Bitácora de reclamaciones',
    roles: ['admin', 'reclamaciones', 'gestor', 'seguridad_vial'],
    puntos: [
      {
        icono: '📄',
        titulo: 'El Excel de 35 hojas, adentro',
        texto: 'Nuevo módulo <b>Reclamaciones</b> en el menú, con las 555 reclamaciones de todas las empresas en una sola lista. Se busca por placa, propietario, aseguradora o radicado, y se filtra por estado, empresa, aseguradora y encargado.'
      },
      {
        icono: '🚦',
        titulo: 'Diez estados y nada más',
        texto: 'Recolección de información, asignación de taller, radicada, en trámite, ofrecimiento, objetada, pagada, no procede, desistida y terminada. La franja de color de cada fila dice en cuál va. Antes había 229 formas distintas de escribir el estado, así que no se podía contar cuántas estaban radicadas.'
      },
      {
        icono: '🗒️',
        titulo: 'La bitácora ya no se pisa',
        texto: 'Cada movimiento es una nota con su fecha y quién la escribió, una debajo de otra. Ya no hay que borrar lo anterior para escribir lo nuevo en la misma celda.'
      },
      {
        icono: '⚠️',
        titulo: 'Lo que no se pudo leer está señalado',
        texto: 'El valor venía escrito a mano y en 273 casos no se pudo convertir en número; la fecha del siniestro tampoco en 277. Donde pasó, la ficha muestra en amarillo lo que decía el Excel para completarlo a mano, en vez de dejar la casilla vacía como si no hubiera nada.'
      }
    ]
  },
  {
    version: '2.30.0',
    titulo: 'Estadística de las infracciones',
    roles: ['empresa', 'admin'],
    puntos: [
      {
        icono: '📊',
        titulo: 'Una pestaña "Estadística" dentro de Infracciones',
        texto: 'Arriba del listado hay dos pestañas: <b>🗂️ Listado</b> y <b>📊 Estadística</b>. Comparten el mismo buscador y los mismos filtros, así que lo que ves en la lista y lo que ves en los gráficos es siempre lo mismo.'
      },
      {
        icono: '🚦',
        titulo: 'En qué se está fallando',
        texto: 'El panel <b>Qué se está infringiendo</b> ordena los comparendos por código: ahí se ve de una si lo que pesa es mal estacionamiento, exceso de velocidad o pasarse el rojo. Es el panel que dice en qué capacitar.'
      },
      {
        icono: '👤',
        titulo: 'Quién y con qué vehículo',
        texto: 'Los conductores con más comparendos, los vehículos que más acumulan, y el reparto por ruta y por empresa. Arriba, cuatro cifras: cuántas son, cuántas siguen <b>sin cancelar</b>, por cuántas responde la empresa de forma <b>solidaria</b> y cuántos conductores son reincidentes.'
      },
      {
        icono: '📅',
        titulo: 'La tendencia',
        texto: 'Sin filtro de año verás una columna por año; si eliges un año, los doce meses de ese año.'
      }
    ]
  },
  {
    version: '2.29.0',
    titulo: 'Histórico de infracciones',
    roles: ['empresa', 'admin'],
    puntos: [
      {
        icono: '🚦',
        titulo: 'Los comparendos, dentro de la aplicación',
        texto: 'Si tu empresa tiene contratado este módulo, en tu portal aparece la pestaña <b>🚦 Infracciones</b> con todo el histórico: fecha, placa, código, el conductor infractor y si está <b>cancelada</b> o <b>sin cancelar</b>. Arriba verás cuántas son y cuántas faltan por pagar, y esos números cambian con el filtro que pongas.'
      },
      {
        icono: '✏️',
        titulo: 'Se registra y se corrige desde ahí',
        texto: 'Con <b>➕ Registrar infracción</b> agregas un comparendo nuevo; tocando cualquiera de la lista la editas —por ejemplo para marcarla como cancelada cuando se pague— o la borras. También puedes descargar a Excel lo que estés viendo, con el filtro aplicado.'
      },
      {
        icono: '🔎',
        titulo: 'Buscar por lo que tengas a mano',
        texto: 'El buscador encuentra por placa, conductor, cédula, número de comparendo o código, y puedes filtrar por año, estado y empresa.'
      }
    ]
  },
  {
    version: '2.28.0',
    titulo: 'Mapa: dónde ocurrieron los siniestros',
    roles: ['empresa', 'admin'],
    puntos: [
      {
        icono: '🗺️',
        titulo: 'Una pestaña nueva en tu portal',
        texto: 'Junto a Históricos está <b>🗺️ Mapa de siniestros</b>. Cada punto es un caso, con el color de su gravedad: verde daños, ámbar heridos, rojo homicidio. Acerca el mapa para separar los grupos y toca un punto para abrir el caso completo.'
      },
      {
        icono: '📍',
        titulo: 'Para ver dónde se repiten',
        texto: 'Las ubicaciones ya se venían guardando en cada caso, pero sólo se podían ver de a una. En el conjunto se nota lo que antes no: qué cruce aparece una y otra vez, qué tramo de una ruta concentra los casos. Puedes filtrar por año, por gravedad y, si administras varias, por empresa.'
      },
      {
        icono: '🔢',
        titulo: 'Te dice cuántos no puede ubicar',
        texto: 'Debajo de la leyenda verás cuántos siniestros está mostrando y cuántos quedaron <b>sin ubicación registrada</b>. Un mapa con menos puntos que casos, sin avisarlo, no serviría para tomar decisiones.'
      }
    ]
  },
  {
    version: '2.27.0',
    titulo: 'Encontrar un vehículo en la lista',
    roles: ['empresa', 'admin'],
    puntos: [
      {
        icono: '🔎',
        titulo: 'Buscador y filtros en "Vehículos registrados"',
        texto: 'Escribe la placa, el número interno, el propietario o su teléfono y la lista se acota sola. La placa la encuentra como la escribas: <b>tpz433</b>, <b>TPZ-433</b> o <b>TPZ 433</b> llevan al mismo bus. Además puedes filtrar por <b>tipo</b> y, si administras varias, por <b>empresa</b>.'
      },
      {
        icono: '🚌',
        titulo: 'Cada vehículo en su propia fila',
        texto: 'En vez de una tabla, ahora cada vehículo es una ficha con el número interno grande a la izquierda y una franja de color según sea bus, automóvil, carga o moto. Si estás vinculado a varias empresas, cada fila dice de cuál es.'
      },
      {
        icono: '📄',
        titulo: 'Tócalo y ves todo',
        texto: 'Al tocar un vehículo se abre su ficha completa: propietario, cédula, teléfono, conductor y aseguradora. Lo que esté sin registrar aparece marcado, para saber qué hay que completar. Los que tienen huecos llevan la etiqueta <b>Faltan datos</b> en la lista, y hay un filtro para verlos todos juntos.'
      }
    ]
  },
  {
    version: '2.26.0',
    titulo: 'Agregar vehículos desde Parque automotor',
    roles: ['admin'],
    puntos: [
      {
        icono: '🚌',
        titulo: 'Los mismos tres botones, para las 22 empresas',
        texto: 'En <b>Parque automotor</b>, arriba a la derecha: <b>➕ Agregar vehículo</b>, <b>⬇️ Plantilla</b> y <b>⬆️ Importar</b>. Eliges la empresa de una lista con las que ya existen en el parque, así un dedazo no crea una empresa fantasma. Es la misma maquinaria que usa la transportadora en su portal.'
      },
      {
        icono: '👁️',
        titulo: 'En "Ver su portal" los verás apagados',
        texto: 'Esa pantalla sigue siendo de solo lectura: muestra los botones para que sepas que la empresa los tiene, pero no escribe. La <b>plantilla</b> sí se puede bajar desde ahí, y es exactamente la que recibiría esa empresa.'
      }
    ]
  },
  {
    version: '2.25.0',
    titulo: 'Registra tus propios vehículos',
    roles: ['empresa'],
    puntos: [
      {
        icono: '🚌',
        titulo: 'Agregar un vehículo desde tu portal',
        texto: 'En <b>Vehículos registrados</b> está el botón <b>➕ Agregar vehículo</b>. Lo único obligatorio es la <b>placa</b>; el número interno, el tipo, el modelo, el propietario y su teléfono los puedes poner ahí mismo o dejarlos para después. Desde que el vehículo queda registrado, sus siniestros salen con esos datos en vez de aparecer en blanco.'
      },
      {
        icono: '📋',
        titulo: '¿Son muchos? La plantilla de Excel',
        texto: 'El botón <b>⬇️ Descargar plantilla</b> te baja un Excel con tres hojas: <b>VEHICULOS</b> (donde escribes), <b>EJEMPLO</b> (dos vehículos ya diligenciados, para ver cómo va cada dato) e <b>INSTRUCCIONES</b> (qué se escribe en cada columna). La llenas y la subes con <b>⬆️ Importar desde Excel</b>.'
      },
      {
        icono: '✅',
        titulo: 'No se duplica nada y te dice qué quedó afuera',
        texto: 'Las placas que ya estaban registradas se saltan solas. Al terminar el cargue verás cuántas entraron, cuántas ya estaban y —fila por fila— cuáles hay que revisar y por qué. La placa se guarda siempre limpia, así la escribas con guion, con espacio o en minúscula.'
      }
    ]
  },
  {
    version: '2.24.0',
    titulo: 'Ver el portal como lo ve cada usuario',
    roles: ['admin'],
    puntos: [
      {
        icono: '👁️',
        titulo: 'Un botón junto a cada usuario de empresa',
        texto: 'En la tabla de usuarios, al lado de sus empresas, está <b>👁 Ver su portal</b>: abre el portal con <b>todas</b> las empresas de ese usuario, igual que las ve él. Sirve para comprobar qué alcanza a ver antes de entregarle la clave, sin tener que entrar con su cuenta.'
      },
      {
        icono: '↩️',
        titulo: 'Se vuelve por donde entraste',
        texto: 'El botón de arriba dice «← Usuarios» si entraste desde el panel de usuarios, y «← Dashboard» si entraste desde la ficha de siniestralidad.'
      }
    ]
  },
  {
    version: '2.23.0',
    titulo: 'Varias empresas al crear el usuario',
    roles: ['admin'],
    puntos: [
      {
        icono: '🏢',
        titulo: 'Marca las empresas desde el formulario',
        texto: 'Al crear un usuario de empresa, junto al selector hay un botón <b>+ Otras empresas</b> que abre la lista con casillas. Antes había que crear el usuario, buscarlo en la tabla y recién ahí marcárselas; ahora queda listo de una. Desde la tabla se siguen pudiendo cambiar cuando quieras.'
      }
    ]
  },
  {
    version: '2.22.1',
    titulo: 'APL: filtros por año y por mes',
    roles: ['admin'],
    puntos: [
      {
        icono: '🗓️',
        titulo: 'Año, mes y búsqueda sobre los 1.046 registros',
        texto: 'La consulta de APL ya tiene selectores de <b>año</b> y de <b>mes</b>, y el buscador encuentra por placa, conductor, afiliado o ruta. Todo se aplica sobre la hoja completa —no sobre la página que estás viendo—, y el conteo de arriba te dice cuántos quedaron.'
      }
    ]
  },
  {
    version: '2.22.0',
    titulo: 'Consulta de los registros de APL',
    roles: ['admin'],
    puntos: [
      {
        icono: '📡',
        titulo: 'La hoja de APL, dentro de ASIS PLUS',
        texto: 'En el inicio hay un módulo nuevo: <b>Registros de APL</b>. Lee la hoja publicada en línea y muestra sus registros con el mismo buscador, paginación y descarga a Excel que el resto. El botón <b>🔄 Actualizar</b> la vuelve a leer, así que siempre puedes ver lo último sin salir de la aplicación.'
      },
      {
        icono: 'ℹ️',
        titulo: 'No se guarda nada',
        texto: 'Los registros se consultan, no se importan: quien mantiene la hoja sigue trabajando en ella y aquí se ve tal cual. Es información de otra operación, así que no se mezcla con el registro de asistencias ni con el parque automotor.'
      }
    ]
  },
  {
    version: '2.21.0',
    titulo: 'Los documentos dicen qué son, y aparecen los acuerdos',
    puntos: [
      {
        icono: '📄',
        titulo: 'Cada adjunto dice qué es y de cuándo',
        texto: 'Antes salía sólo el nombre del archivo («DESISTIMIENTO (10).pdf»). Ahora cada documento dice <b>qué clase de documento es</b> —desistimiento, declaración, IPAT, historia clínica…—, de qué tipo de archivo se trata y <b>la fecha en que se subió</b>.'
      },
      {
        icono: '🤝',
        titulo: 'Acuerdos firmados del caso',
        texto: 'Si del siniestro salió un acuerdo, ahora se ve en el detalle: <b>de qué tipo es, con quién se acordó, por cuánto, cómo se paga y quién firmó</b>, con el PDF a un clic. Antes el desistimiento aparecía suelto entre los adjuntos, sin decir de qué acuerdo salía, y esa información sólo se veía dentro del flujo de cierre.'
      },
      {
        icono: '🔖',
        titulo: 'El número de caso en el visor',
        texto: 'El Registro de Asistencias no mostraba el número del caso al abrir el detalle. Ahora encabeza la ficha.'
      }
    ]
  },
  {
    version: '2.20.1',
    titulo: 'Reclamaciones y Seguridad Vial ven todos los casos',
    roles: ['seguridad_vial', 'reclamaciones', 'admin'],
    puntos: [
      {
        icono: '🔎',
        titulo: 'El registro completo, además de tu bandeja',
        texto: 'Tu bandeja sigue mostrando lo que te toca atender. Pero ahora tienes también el <b>Registro de Asistencias</b> y <b>Terceros</b> en el inicio: cualquier siniestro, con toda su información (versiones, fotos, documentos y terceros). Para revisar antecedentes de un conductor o un tercero que ya apareció antes, ya no hay que pedirlo.'
      }
    ]
  },
  {
    version: '2.20.0',
    titulo: 'Las versiones, como se deben leer (y oír)',
    puntos: [
      {
        icono: '🗣️',
        titulo: 'La versión del conductor y la del asistente, destacadas',
        texto: 'Son lo que más se lee de un caso, y estaban apretadas en una columna estrecha como un dato más. Ahora ocupan el ancho del detalle, con el relato completo y respetando los saltos de línea.'
      },
      {
        icono: '🔊',
        titulo: 'Las versiones grabadas por fin se pueden oír',
        texto: 'El asistente puede <b>dictar</b> la versión en vez de escribirla. Hasta ahora, en el detalle salía el nombre del archivo: el caso parecía <b>no tener versión</b>. Ahora hay un reproductor ahí mismo, con una etiqueta que avisa si la versión está grabada.'
      },
      {
        icono: '🏢',
        titulo: 'También para la empresa',
        texto: 'El portal de empresa usa la misma pieza que la administración, así que las empresas ven el relato completo y oyen las grabaciones de sus propios casos.'
      }
    ]
  },
  {
    version: '2.19.0',
    titulo: 'La app se actualiza sola',
    puntos: [
      {
        icono: '🔄',
        titulo: 'Ya no hay que recargar a mano',
        texto: 'Antes la app solo miraba si había versión nueva <b>al abrirla</b>. Como se queda abierta todo el día, una mejora podía tardar días en llegarte. Ahora revisa cada pocos minutos y al volver a la pestaña, y se actualiza sola.'
      },
      {
        icono: '🛡️',
        titulo: 'Pero nunca en medio de tu trabajo',
        texto: 'Si estás llenando un caso, subiendo fotos o te quedan cambios por sincronizar, <b>no se recarga</b>: espera a que termines. Solo entonces entra la versión nueva. Si prefieres aplicarla de una, el aviso de siempre sigue ahí.'
      },
      {
        icono: '📄',
        titulo: 'Los datos del caso se leen mejor',
        texto: 'Las horas de llegada y de fin de atención se ven como fecha y no como un número largo, las notificaciones dicen qué se notificó, y <b>los documentos adjuntos ahora se abren</b> con un clic en vez de mostrar un texto ilegible.'
      }
    ]
  },
  {
    version: '2.18.9',
    titulo: 'La empresa ve el caso entero',
    roles: ['empresa', 'admin', 'gestor'],
    puntos: [
      {
        icono: '📋',
        titulo: 'Todos los campos, no una selección',
        texto: 'El detalle mostraba diez campos escogidos a mano. Ahora trae <b>todo lo registrado</b>: la versión del conductor, la hipótesis, la categorización, los lesionados, las observaciones y lo que venga. Si mañana se agrega un campo nuevo, aparece solo.'
      },
      {
        icono: '👥',
        titulo: 'Los terceros involucrados',
        texto: 'Con su ficha completa y su evidencia: cédula, licencia, matrícula y los daños de su vehículo.'
      },
      {
        icono: '🗺️',
        titulo: 'Y el mapa del lugar',
        texto: 'Si el caso tiene coordenadas, se ve dónde pasó y se puede abrir en Google Maps.'
      }
    ]
  },
  {
    version: '2.18.8',
    titulo: 'Un usuario puede tener varias empresas',
    roles: ['admin', 'empresa'],
    puntos: [
      {
        icono: '🏢',
        titulo: 'Porque un vehículo no siempre está a nombre de quien lo opera',
        texto: 'COOMETROPOL tiene <b>11 siniestros</b> con placas que en el parque figuran a nombre de COOINVETRANS, TRANSLAMAYA GUAYABAL, INVETRANS y TRANSCONOR. Su usuario no los veía, porque el vínculo era con <b>una sola</b> empresa.'
      },
      {
        icono: '☑️',
        titulo: 'Se eligen desde el panel de usuarios',
        texto: 'En la columna <b>Empresa</b> de cada usuario hay un botón para marcar todas las que debe ver. La principal aparece resaltada y se sigue cambiando desde la columna «Rol».'
      },
      {
        icono: '🔒',
        titulo: 'Cada empresa sigue viendo solo lo suyo',
        texto: 'El permiso no se abrió: solo dejó de limitarse a un nombre. Un usuario ve los casos, vehículos y terceros de <b>las empresas que tenga marcadas</b>, ni una más.'
      }
    ]
  },
  {
    version: '2.18.7',
    titulo: 'La empresa ve su caso completo',
    roles: ['empresa', 'admin', 'gestor'],
    puntos: [
      {
        icono: '📸',
        titulo: 'Con las fotos y las firmas',
        texto: 'Al abrir un caso desde el portal ya no se ve solo texto: aparecen <b>las fotos del siniestro</b>, la firma del conductor y la del asistente, y la ficha de cada tercero con su evidencia. Es la misma información que ve la administración.'
      },
      {
        icono: '🔽',
        titulo: 'Filtros por año, gravedad y estado',
        texto: 'Además del buscador, tres selectores para acotar el historial. Se suman entre sí y con lo que escribas: <b>2025 + Daños y lesiones</b> deja solo esos. Solo aparecen los valores que la empresa realmente tiene, para que ningún filtro lleve a una lista vacía.'
      },
      {
        icono: '🧹',
        titulo: 'Un botón para volver a empezar',
        texto: 'Cuando hay algo acotando la lista aparece <b>«Limpiar filtros»</b>, y el contador va diciendo cuántos casos se están viendo de cuántos.'
      }
    ]
  },
  {
    version: '2.18.6',
    titulo: 'Las fotos también en el visor de registros',
    roles: ['admin', 'gestor'],
    puntos: [
      {
        icono: '🖼️',
        titulo: 'Al abrir un registro ahora se ven las imágenes',
        texto: 'El visor de «Registro de asistencias» mostraba solo texto: las fotos y las firmas estaban escondidas porque antes no había archivo que mostrar, únicamente su nombre. Ahora aparecen como <b>miniaturas</b>, y al tocarlas se abren en grande.'
      },
      {
        icono: '🧾',
        titulo: 'Las del siniestro y las de cada tercero, por separado',
        texto: 'Arriba, lo que fotografió el asistente del vehículo asegurado, con la firma del conductor y la suya. Abajo, dentro de la ficha de cada tercero, su cédula, licencia, matrícula y los daños de su vehículo.'
      }
    ]
  },
  {
    version: '2.18.5',
    titulo: 'Ya se pueden buscar los casos',
    roles: ['empresa', 'admin', 'gestor', 'asistente', 'seguridad_vial'],
    puntos: [
      {
        icono: '🔍',
        titulo: 'Un buscador en la bandeja y en el historial',
        texto: 'Escribe lo que recuerdes y la lista se va filtrando: <b>número de caso</b>, <b>empresa</b>, <b>placa</b>, <b>número interno</b>, <b>conductor</b>, <b>cédula</b>, <b>dirección</b> o <b>fecha</b>. No hace falta acertar con las tildes ni con las mayúsculas.'
      },
      {
        icono: '➕',
        titulo: 'Varias palabras afinan la búsqueda',
        texto: 'Si escribes más de una, deben aparecer todas. <b>«cootranspinal 2026»</b> trae los de esa empresa en ese año; <b>«TSG045 lesiones»</b>, los de esa placa que dejaron heridos. El orden da igual.'
      },
      {
        icono: '🗄️',
        titulo: 'Los casos antiguos también, si los pides',
        texto: 'La bandeja sigue mostrando el trabajo del día. Para llegar a los 2.707 casos importados, marca <b>«Buscar también en históricos»</b> y busca: se traen una sola vez y quedan listos.'
      }
    ]
  },
  {
    version: '2.18.4',
    titulo: 'Los casos viejos ya tienen sus fotos',
    roles: ['admin', 'gestor'],
    puntos: [
      {
        icono: '📷',
        titulo: 'Se ven las fotos de los casos importados',
        texto: 'Los casos que venían del aplicativo anterior guardaban el <b>nombre</b> de cada foto, pero la imagen no estaba: al abrirlos no había nada que ver. Ya se subieron las <b>36.503</b> imágenes y ahora la galería las muestra como las de cualquier caso.'
      },
      {
        icono: '✍️',
        titulo: 'También las firmas y las fotos del tercero',
        texto: 'Vuelven a aparecer la firma del conductor y la del asistente, y la evidencia del tercero: cédula, licencia, matrícula y los daños de su vehículo.'
      },
      {
        icono: '🗂️',
        titulo: 'Quedaron todos, sin excepción',
        texto: 'Se comprobó uno por uno contra la base: los <b>2.596 casos</b> y los <b>2.191 terceros</b> que tenían evidencia registrada la tienen completa. Ninguno se quedó sin imagen.'
      }
    ]
  },
  {
    version: '2.18.3',
    titulo: 'El historial, más fácil de leer',
    roles: ['empresa', 'admin', 'gestor'],
    puntos: [
      {
        icono: '🟩',
        titulo: 'Una franja de color dice qué tan grave fue',
        texto: 'Cada caso lleva una barra a la izquierda: <b>verde</b> si fue solo daños, <b>naranja</b> si hubo lesiones, <b>rojo</b> si hubo homicidio. Se puede recorrer la lista entera y ver dónde está lo grave sin leer una palabra.'
      },
      {
        icono: '🗓️',
        titulo: 'Cada caso es una tarjeta, no una fila de tabla',
        texto: 'La tabla se estiraba a lo ancho y separaba datos que van juntos: la placa quedaba lejísimos de su conductor. Ahora cada caso agrupa <b>cuándo fue</b>, <b>qué vehículo y quién manejaba</b>, y <b>cómo resultó</b>.'
      },
      {
        icono: '📅',
        titulo: 'La fecha se ve de un vistazo',
        texto: 'Va en un bloque tipo calendario, con el día grande y el mes debajo. La hora y el número de caso pasan a segundo plano: sirven para citar el caso, no para buscarlo.'
      }
    ]
  },
  {
    version: '2.18.2',
    titulo: 'El historial de casos, legible',
    roles: ['empresa', 'admin', 'gestor'],
    puntos: [
      {
        icono: '🔢',
        titulo: 'Los casos viejos ya tienen número',
        texto: 'Los siniestros anteriores al sistema actual salían con un guion en la columna del número, porque nunca lo tuvieron. Ahora llevan uno propio, tipo <b>H-2025-1440</b>, y se puede citar por teléfono o por correo. Los de la app siguen siendo <b>CASO-2026-…</b>, para saber de dónde viene cada uno.'
      },
      {
        icono: '🔽',
        titulo: 'El más reciente va primero',
        texto: 'El listado salía desordenado. La culpa era de ordenar por la fecha en que el caso entró al sistema: los históricos se cargaron todos el mismo día, así que esa fecha no distingue nada. Ahora se ordena por la <b>fecha real del siniestro</b>.'
      },
      {
        icono: '📅',
        titulo: 'Fechas como se leen aquí',
        texto: 'Se veían como 9/1/2026, que se presta a confusión. Ahora salen <b>dd/mm/aaaa</b>, con la hora debajo.'
      },
      {
        icono: '👁️',
        titulo: 'Más información en menos espacio',
        texto: 'La tabla tenía columnas anchas y casi vacías. Ahora cada caso muestra también el <b>conductor</b>, el número interno y el tipo de vehículo, sin ocupar más. En el celular cada caso se ve como una tarjeta.'
      }
    ]
  },
  {
    version: '2.18.1',
    titulo: 'Ver el portal de cualquier empresa',
    roles: ['admin', 'gestor'],
    puntos: [
      {
        icono: '👁️',
        titulo: 'Entra al portal tal como lo ve la empresa',
        texto: 'En <b>Dashboard → Ficha por empresa</b>, el botón <b>«Ver su portal completo»</b> abre la pantalla que ve esa empresa: sus métricas, su historial de casos y su parque. No es una imitación, es la misma pantalla.'
      },
      {
        icono: '📄',
        titulo: 'El historial ahora va por páginas',
        texto: 'Antes se dibujaban todos los casos de golpe. Con empresas de 400 o más eso hacía pesada la pantalla en el celular; ahora van de 50 en 50.'
      },
      {
        icono: '🔢',
        titulo: 'Y se traen completos',
        texto: 'La consulta no pedía más de 1.000 casos, así que una empresa grande habría quedado contada de menos <b>sin avisar</b>. Ya se traen todos.'
      }
    ]
  },
  {
    version: '2.18.0',
    titulo: 'Ficha de siniestralidad por empresa',
    roles: ['empresa', 'admin', 'gestor'],
    puntos: [
      {
        icono: '📊',
        titulo: 'La empresa ya no ve solo una barra por mes',
        texto: 'El portal abre con una <b>ficha completa</b>: cuántos siniestros hubo, si subieron o bajaron frente al periodo anterior, qué tan graves fueron y cuántos fueron responsabilidad del conductor.'
      },
      {
        icono: '⚖️',
        titulo: 'Siniestros por cada 100 vehículos',
        texto: 'Contar casos sueltos hace ver mal a quien tiene más buses. Ahora se mide <b>descontando el tamaño de la flota</b>, que es lo único comparable entre una empresa de 30 vehículos y una de 600.'
      },
      {
        icono: '🚌',
        titulo: 'Qué vehículos y qué conductores repiten',
        texto: 'Dos listas nuevas muestran las placas y los conductores con más siniestros en el periodo. Es lo accionable: revisar ese bus, sentarse con ese conductor.'
      },
      {
        icono: '🕐',
        titulo: 'A qué hora y qué día pasan',
        texto: 'La ficha señala la <b>franja horaria</b> y el <b>día de la semana</b> donde se concentran los siniestros, para ajustar turnos y despachos.'
      },
      {
        icono: '🏢',
        titulo: 'SoluAsistencia ve la misma ficha',
        texto: 'En el Dashboard hay una pestaña <b>Ficha por empresa</b> con exactamente la misma pantalla que ve la empresa, más un comparativo de siniestralidad entre todas. La reunión mensual se hace sobre los mismos números.'
      }
    ]
  },
  {
    version: '2.17.5',
    titulo: 'Lugar de impacto (IPAT)',
    puntos: [
      {
        icono: '↔️',
        titulo: 'Derecha e izquierda estaban al revés',
        texto: 'En la vista <b>frontal</b>, lo que decía «derecho» era en realidad el costado izquierdo del vehículo. Ya está corregido.'
      },
      {
        icono: '🧭',
        titulo: 'El dibujo ahora te dice cómo está puesto',
        texto: 'El vehículo se ve <b>desde arriba</b>, con el frente hacia arriba. Alrededor del dibujo aparece dónde está el frente, la parte trasera y cada costado. <b>Izquierda y derecha son las del vehículo</b>, como las ve el conductor sentado al volante.'
      },
      {
        icono: '🚌',
        titulo: 'Impacto lateral: ahora se dice de qué costado',
        texto: 'Al elegir <b>Lateral</b> te pregunta si fue el costado izquierdo o el derecho, y las tres franjas se dibujan sobre ese lado.'
      }
    ],
    aviso: 'Si antes de hoy registraste un impacto <b>frontal</b> señalando un costado, revísalo: pudo quedar guardado al revés.'
  },
  {
    version: '2.17.3',
    titulo: 'Grabación de voz',
    puntos: [
      {
        icono: '🔆',
        titulo: 'La pantalla ya no se apaga mientras grabas',
        texto: 'Antes, si el conductor hablaba un rato y nadie tocaba el teléfono, la pantalla se apagaba y la grabación se cortaba a mitad de frase. Ya no pasa.'
      },
      {
        icono: '📱',
        titulo: 'Salirte de la app ya no corta la grabación',
        texto: 'Si te entra una llamada o cambias de aplicación un momento, la grabación sigue.'
      }
    ]
  },
  {
    version: '2.17.0',
    titulo: 'Nada se pierde si te sales',
    puntos: [
      {
        icono: '🎙️',
        titulo: 'La voz se guarda al pulsar «Detener»',
        texto: 'No hay que esperar a «Guardar cambios». Sin señal queda en el teléfono y sube sola al reconectar.'
      },
      {
        icono: '✍️',
        titulo: 'La firma se guarda al levantar el dedo',
        texto: 'Ya no hay que perseguir al conductor para que vuelva a firmar.'
      },
      {
        icono: '💾',
        titulo: 'Lo que escribes se guarda solo',
        texto: 'Mientras llenas el caso se va guardando, incluso sin señal. Si la app se cierra, al volver a abrir el caso lo recuperas.'
      }
    ]
  }
];

/** Compara dos versiones tipo "2.17.5". Devuelve >0 si a es más nueva que b. */
function compararVersiones(a, b) {
  const pa = String(a || '0').split('.').map(Number);
  const pb = String(b || '0').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/**
 * Novedades que este dispositivo aún no ha visto. La primera vez sólo se
 * muestra la última: a quien recién instala la app no le sirve el historial.
 */
function novedadesPendientes() {
  let vista = '';
  try { vista = localStorage.getItem(NOVEDADES_KEY) || ''; } catch (_) { return []; }
  // Se filtra por rol ANTES de recortar: a quien recién instala hay que
  // mostrarle la última novedad que le sirva A ÉL, no la última de todas
  // (si esa fuera de otro rol, se quedaría sin ver ninguna).
  const mias = NOVEDADES.filter(esParaMiRol);
  if (!vista) return mias.slice(0, 1);
  return mias.filter(n => compararVersiones(n.version, vista) > 0);
}

/** ¿Esta novedad le toca al rol de quien está usando la app ahora? */
function esParaMiRol(n) {
  if (!n.roles || !n.roles.length) return true;   // sin destinatario = para todos
  const rol = (typeof state !== 'undefined' && state.perfil && state.perfil.rol) || '';
  return n.roles.includes(rol);
}

/** Deja constancia de que ya se leyeron, para no repetir el aviso. */
function marcarNovedadesVistas() {
  try { localStorage.setItem(NOVEDADES_KEY, APP_VERSION); } catch (_) { /* modo privado */ }
}

function escNov(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Arma el contenido del modal a partir de una lista de versiones. */
function pintarNovedades(lista) {
  const cuerpo = document.getElementById('novedadesBody');
  if (!cuerpo) return;

  // El texto de cada punto lleva <b> a propósito (lo escribimos nosotros, no
  // viene de la base): sólo se escapan el título y la versión.
  cuerpo.innerHTML = lista.map(n => `
    <section class="nov-version">
      <div class="nov-version-cab">
        <h3>${escNov(n.titulo)}</h3>
        <span class="nov-tag">v${escNov(n.version)}</span>
      </div>
      <ul class="nov-lista">
        ${n.puntos.map(p => `
          <li class="nov-punto">
            <span class="nov-icono" aria-hidden="true">${p.icono}</span>
            <div>
              <b>${escNov(p.titulo)}</b>
              <p>${p.texto}</p>
            </div>
          </li>
        `).join('')}
      </ul>
      ${n.aviso ? `<p class="nov-aviso">⚠️ ${n.aviso}</p>` : ''}
    </section>
  `).join('');
}

function abrirNovedades(lista) {
  const modal = document.getElementById('novedadesModal');
  if (!modal) return;
  pintarNovedades(lista && lista.length ? lista : NOVEDADES.slice(0, 1));
  modal.classList.add('show');
}

function cerrarNovedades() {
  const modal = document.getElementById('novedadesModal');
  if (modal) modal.classList.remove('show');
  marcarNovedadesVistas();
}

/**
 * Muestra el aviso si hay algo nuevo. Se llama al entrar a la app (no en la
 * pantalla de inicio de sesión: allí no hay a quién contárselo).
 */
function initNovedades() {
  const pendientes = novedadesPendientes();
  if (!pendientes.length) return;
  // Un respiro para que el aviso no compita con la carga de la bandeja.
  setTimeout(() => abrirNovedades(pendientes), 900);
}

/** Engancha el botón de cerrar y el número de versión del encabezado. */
function initNovedadesUI() {
  ['btnNovedadesCerrar', 'btnNovedadesCerrarX'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', cerrarNovedades);
  });

  const modal = document.getElementById('novedadesModal');
  if (modal) {
    modal.addEventListener('click', ev => { if (ev.target === modal) cerrarNovedades(); });
  }

  // Tocar la versión del encabezado vuelve a mostrar las novedades: si el
  // asistente cerró el aviso sin leerlo, puede volver a él.
  const ver = document.getElementById('appVersion');
  if (ver) {
    ver.classList.add('app-version-link');
    ver.title = 'Ver qué cambió en esta versión';
    ver.addEventListener('click', () => {
      const mias = NOVEDADES.filter(esParaMiRol);
      abrirNovedades(mias.slice(0, 1));
    });
  }
}

document.addEventListener('DOMContentLoaded', initNovedadesUI);
