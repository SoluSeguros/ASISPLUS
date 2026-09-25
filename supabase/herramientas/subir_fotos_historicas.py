# -*- coding: utf-8 -*-
r"""Sube a Supabase Storage las fotos y firmas historicas del AppSheet viejo.

Las imagenes de los casos importados nunca estuvieron en Storage: la base solo
guarda el NOMBRE del archivo en `datos` (por ejemplo
`TERCEROS_Images/d021acdf.FOTO CEDULA PRIMERA CARA.234436.jpg`). Los archivos
vivian en Google Drive y se bajaron como ZIP.

Este script los sube CON ESA MISMA RUTA dentro del bucket `fotos-casos`, asi que
NO hay que reescribir un solo registro: la app los encuentra solos.
  - las firmas del caso        -> cargarFirmasCaso() lee datos[campo]
  - las fotos de tercero       -> cargarFotosTerceroExistentes() ya soporta el
                                  formato viejo de columnas nombradas
  - las fotos del caso         -> rutasFotosCaso() en js/fotos.js lee FOTO 1..10

Propiedades:
  - Lee directo del ZIP: no descomprime 3,5 GB al disco.
  - Reanudable: anota cada exito en `subidos.txt`; al reiniciar se los salta.
  - Idempotente: usa `x-upsert`, correrlo dos veces no duplica ni rompe nada.
  - Tolerante: reintenta 3 veces y deja los fracasos en `fallidos.txt`.

La llave service_role se lee de la variable de entorno SB_KEY o, si no esta, del
archivo ~/.asisplus_sb_key (en el perfil del usuario, fuera del repositorio, que
es publico). El script nunca la imprime ni la copia.

Uso (PowerShell), con la llave en el perfil:
    python supabase\herramientas\subir_fotos_historicas.py --prueba 5   # ensayo
    python supabase\herramientas\subir_fotos_historicas.py              # todo
"""
import io, os, re, sys, time, glob, zipfile, threading
import urllib.request, urllib.parse, urllib.error

REF = 'nbdacyepdjamgqoibtuv'          # el mismo que usa js/config.js (es publico)
BUCKET = 'fotos-casos'
HILOS = 8
REINTENTOS = 3

BASE = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(BASE, '..', '..'))

# Los ZIP tal como los entrega Google Drive, en la raiz del repo (estan en
# .gitignore: son gigabytes y el repositorio es publico). Drive parte la descarga
# cada 2 GB, asi que una carpeta puede venir en varios (…-1-001, …-1-002, …);
# se toman todos los que haya para no depender de cuantas partes salieron.
ZIPS = sorted(glob.glob(os.path.join(RAIZ, '*_Images-*.zip')))

out = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
log = io.open(os.path.join(BASE, 'subida.log'), 'a', encoding='utf-8', newline='\n')


def di(msg):
    out.write(msg + u'\n')
    out.flush()
    log.write(u'%s  %s\n' % (time.strftime('%H:%M:%S'), msg))
    log.flush()


# Donde buscar la llave si no viene por variable de entorno. Va en el perfil del
# usuario y NO dentro del repositorio: este es publico y un descuido con
# .gitignore dejaria la llave en el historial para siempre.
ARCHIVO_LLAVE = os.path.join(os.path.expanduser('~'), '.asisplus_sb_key')


def llave():
    """La llave service_role, de $SB_KEY o del archivo del perfil. Nunca se
    imprime ni se copia a ningun lado."""
    k = os.environ.get('SB_KEY', '').strip()
    if not k and os.path.exists(ARCHIVO_LLAVE):
        # utf-8-sig: si la crean con PowerShell puede traer BOM adelante.
        k = io.open(ARCHIVO_LLAVE, encoding='utf-8-sig').read().strip()
    if not k:
        di(u'ERROR: falta la llave service_role.')
        di(u'  Esta en Supabase > Project Settings > API Keys > service_role.')
        di(u'  Ponla en %s' % ARCHIVO_LLAVE)
        di(u'  o exportala en la variable de entorno SB_KEY.')
        sys.exit(2)
    return k


def tipo(nombre):
    return 'image/png' if nombre.lower().endswith('.png') else 'image/jpeg'


# Storage valida la clave del objeto contra un juego ASCII y responde InvalidKey
# si se sale. De los 36.503 archivos, 7.268 traen enye ("FOTO VEHICULO TERCERO
# DANOS"): es el UNICO caracter que estorba. Se sube con N y la migracion
# 20260925_ruta_fotos_terceros_sin_enye.sql deja las referencias de la base
# apuntando igual. El nombre dentro del ZIP no se toca: sigue siendo la llave
# para reanudar.
CLAVE_OK = re.compile(r"^[\w/!\-.*'()&$@=;:+,? ]*$", re.ASCII)


def clave_storage(nombre):
    return nombre.replace(u'\xd1', 'N').replace(u'\xf1', 'n')


def inventario(prueba=0):
    """Lista [(zip, nombre, bytes)] de lo que todavia falta por subir."""
    faltan = []
    hechos = set()
    p = os.path.join(BASE, 'subidos.txt')
    if os.path.exists(p):
        hechos = set(l.rstrip('\n') for l in io.open(p, encoding='utf-8') if l.strip())

    if not ZIPS:
        di(u'ERROR: no hay ningun *_Images-*.zip en %s' % RAIZ)
        sys.exit(2)

    total = 0
    for z in ZIPS:
        di(u'  lee %s' % os.path.basename(z))
        with zipfile.ZipFile(z) as f:
            for i in f.infolist():
                if i.is_dir():
                    continue
                total += 1
                if i.filename not in hechos:
                    faltan.append((z, i.filename, i.file_size))

    # Antes de empezar: ningun nombre debe quedar fuera del juego que acepta
    # Storage. Si aparece otro caracter raro, mejor saberlo ahora que tras miles
    # de InvalidKey.
    rechazados = [n for _, n, _ in faltan if not CLAVE_OK.match(clave_storage(n))]
    if rechazados:
        di(u'ERROR: %d nombres que Storage rechazaria. Ejemplos:' % len(rechazados))
        for n in rechazados[:5]:
            di(u'   %s' % n)
        sys.exit(2)

    di(u'en los ZIP: %d | ya subidos: %d | por subir: %d (%.2f GB)'
       % (total, total - len(faltan), len(faltan),
          sum(t[2] for t in faltan) / 1024.0 ** 3))
    if prueba:
        faltan = faltan[:prueba]
        di(u'MODO PRUEBA: solo %d archivos' % len(faltan))
    return faltan


_lock = threading.Lock()
_est = {'ok': 0, 'err': 0, 'bytes': 0}


def subir_uno(nombre, datos, key):
    url = 'https://%s.supabase.co/storage/v1/object/%s/%s' % (
        REF, BUCKET, urllib.parse.quote(clave_storage(nombre), safe='/'))
    req = urllib.request.Request(url, data=datos, method='POST')
    req.add_header('Authorization', 'Bearer ' + key)
    req.add_header('Content-Type', tipo(nombre))
    req.add_header('x-upsert', 'true')      # repetible: sobrescribe en vez de fallar
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.status


def trabajador(tareas, idx, key, fok, ferr):
    # Cada hilo abre su propio handle: zipfile no es seguro de compartir.
    abiertos = {}
    try:
        while True:
            with _lock:
                if idx[0] >= len(tareas):
                    return
                z, nombre, tam = tareas[idx[0]]
                idx[0] += 1

            if z not in abiertos:
                abiertos[z] = zipfile.ZipFile(z)
            try:
                datos = abiertos[z].read(nombre)
            except Exception as e:
                with _lock:
                    _est['err'] += 1
                    ferr.write(u'%s\tno se pudo leer del ZIP: %s\n' % (nombre, e))
                continue

            ultimo = ''
            for intento in range(REINTENTOS):
                try:
                    subir_uno(nombre, datos, key)
                    with _lock:
                        _est['ok'] += 1
                        _est['bytes'] += tam
                        fok.write(nombre + u'\n')
                        if _est['ok'] % 250 == 0:
                            fok.flush()
                    break
                except urllib.error.HTTPError as e:
                    cuerpo = e.read()[:160].decode('utf-8', 'replace')
                    ultimo = 'HTTP %s %s' % (e.code, cuerpo)
                    if e.code in (401, 403):
                        break          # credencial mala: insistir no sirve
                    time.sleep(1.5 * (intento + 1))
                except Exception as e:
                    ultimo = str(e)[:160]
                    time.sleep(1.5 * (intento + 1))
            else:
                with _lock:
                    _est['err'] += 1
                    ferr.write(u'%s\t%s\n' % (nombre, ultimo))
    finally:
        for f in abiertos.values():
            try:
                f.close()
            except Exception:
                pass


def main():
    prueba = 0
    if '--prueba' in sys.argv:
        prueba = int(sys.argv[sys.argv.index('--prueba') + 1])

    key = llave()
    tareas = inventario(prueba)
    if not tareas:
        di(u'No queda nada por subir.')
        return

    peso = sum(t[2] for t in tareas)
    fok = io.open(os.path.join(BASE, 'subidos.txt'), 'a', encoding='utf-8', newline='\n')
    ferr = io.open(os.path.join(BASE, 'fallidos.txt'), 'a', encoding='utf-8', newline='\n')
    idx = [0]
    t0 = time.time()

    hilos = [threading.Thread(target=trabajador, args=(tareas, idx, key, fok, ferr))
             for _ in range(HILOS)]
    for h in hilos:
        h.start()

    while any(h.is_alive() for h in hilos):
        time.sleep(15)
        with _lock:
            ok, err, by = _est['ok'], _est['err'], _est['bytes']
        seg = max(1.0, time.time() - t0)
        vel = by / 1024.0 / 1024.0 / seg
        resta = (peso - by) / 1024.0 / 1024.0 / max(0.05, vel) / 60
        di(u'  %d/%d subidos, %d fallidos | %.2f GB | %.1f MB/s | faltan ~%d min'
           % (ok, len(tareas), err, by / 1024.0 ** 3, vel, resta))

    for h in hilos:
        h.join()
    fok.close()
    ferr.close()
    di(u'LISTO: %d subidos, %d fallidos, %.2f GB en %.1f min'
       % (_est['ok'], _est['err'], _est['bytes'] / 1024.0 ** 3,
          (time.time() - t0) / 60))
    if _est['err']:
        di(u'Revisa fallidos.txt y vuelve a correr el script: reanuda donde quedo.')


if __name__ == '__main__':
    main()
