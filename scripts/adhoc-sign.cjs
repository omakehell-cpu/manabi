const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

/**
 * Firma ad-hoc la app de macOS después de empaquetarla.
 *
 * Sin cuenta de Apple Developer no hay firma de verdad, pero «sin firmar»
 * y «mal firmada» no son lo mismo. Con `identity: null`, electron-builder
 * deja solo la firma que pone el enlazador: identificador `Electron`, el
 * Info.plist sin ligar y los recursos declarados pero ausentes. macOS no
 * la trata como una app sin firmar sino como una app manipulada, y en
 * Apple Silicon se niega a abrirla —«está dañada»— sin que valga el clic
 * derecho → Abrir.
 *
 * Una firma ad-hoc del bundle entero arregla eso: sigue sin ser de un
 * desarrollador identificado, así que Gatekeeper avisa la primera vez,
 * pero es un aviso que el usuario puede saltarse en lugar de un muro.
 */
exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app])
  execFileSync('codesign', ['--verify', '--deep', '--strict', app])
}
