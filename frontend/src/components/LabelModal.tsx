import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import QRCode from 'react-qr-code'
import { Printer, X } from 'lucide-react'
import type { Product } from '@/types'

interface Props {
  product: Product
  onClose: () => void
}

// Etiqueta real que se imprime (100mm × 70mm, sin escala)
function LabelContent({ product }: { product: Product }) {
  const barcodeRef = useRef<SVGSVGElement>(null)
  const barcodeValue = product.barcode || product.sku

  useEffect(() => {
    if (!barcodeRef.current) return
    try {
      JsBarcode(barcodeRef.current, barcodeValue, {
        format: 'CODE128',
        width: 1.6,
        height: 32,
        displayValue: false,
        margin: 0,
      })
    } catch {
      // barcode inválido — silencioso
    }
  }, [barcodeValue])

  return (
    <div
      style={{
        width: '100mm',
        height: '70mm',
        padding: '4mm',
        fontFamily: 'Arial, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
        backgroundColor: '#fff',
      }}
    >
      {/* Nombre del producto */}
      <div style={{ fontSize: '12pt', fontWeight: 'bold', lineHeight: 1.2, color: '#0f172a', maxHeight: '18mm', overflow: 'hidden' }}>
        {product.name}
      </div>

      {/* Barcode + QR */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4mm', flex: 1, marginTop: '3mm' }}>
        {/* Lado izquierdo: SKU + barcode */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '7pt', color: '#475569', marginBottom: '1mm', fontFamily: 'monospace' }}>
            SKU: {product.sku}
          </div>
          <svg ref={barcodeRef} style={{ width: '100%', maxHeight: '32px' }} />
          <div style={{ fontSize: '6pt', color: '#64748b', textAlign: 'center', fontFamily: 'monospace', marginTop: '1mm' }}>
            {barcodeValue}
          </div>
        </div>

        {/* Lado derecho: QR */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1mm' }}>
          <QRCode value={product.sku} size={52} level="M" />
          <div style={{ fontSize: '5pt', color: '#94a3b8' }}>SKU</div>
        </div>
      </div>
    </div>
  )
}

export default function LabelModal({ product, onClose }: Props) {
  return (
    <>
      {/* Modal de preview — oculto al imprimir */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800">Vista previa de etiqueta</h2>
            <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-400">
              <X size={16} />
            </button>
          </div>

          {/* Preview escala 2x */}
          <div className="flex justify-center py-6 bg-slate-50">
            <div style={{ transform: 'scale(1.6)', transformOrigin: 'top center', marginBottom: '75px' }}>
              <div className="border border-slate-300 shadow-sm">
                <LabelContent product={product} />
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="px-4 py-2 text-xs text-slate-400 text-center border-t border-slate-100">
            Tamaño de impresión: 100 × 70 mm · Seleccioná la impresora Zebra en el diálogo
          </div>

          {/* Acciones */}
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100">
            <button className="btn-secondary text-xs" onClick={onClose}>Cancelar</button>
            <button
              className="btn-primary text-xs"
              onClick={() => window.print()}
            >
              <Printer size={13} /> Imprimir
            </button>
          </div>
        </div>
      </div>

      {/* Etiqueta real — solo visible al imprimir */}
      <div className="label-print-root">
        <LabelContent product={product} />
      </div>
    </>
  )
}
