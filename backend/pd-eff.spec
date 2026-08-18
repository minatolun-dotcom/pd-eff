# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['run_desktop.py'],
    pathex=[],
    binaries=[],
    datas=[('pdf_signer', 'pdf_signer')],
    hiddenimports=['pdf_signer', 'pdf_signer.main', 'pdf_signer.database', 'pdf_signer.signing_service', 'pdf_signer.verification_service', 'pdf_signer.cert_utils', 'pdf_signer.config', 'pdf_signer.pkcs11_service', 'uvicorn', 'uvicorn.logging', 'uvicorn.loops', 'uvicorn.loops.auto', 'uvicorn.protocols', 'uvicorn.protocols.http', 'uvicorn.protocols.http.auto', 'uvicorn.protocols.websockets', 'uvicorn.protocols.websockets.auto', 'uvicorn.lifespan', 'uvicorn.lifespan.on'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='pd-eff',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
