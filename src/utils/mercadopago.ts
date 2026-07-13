import { config } from "../config"

interface PixPayment {
  amount: number
  description: string
  email: string
  firstName?: string
  orderId: string
}

export interface PixPaymentResult {
  id: number
  qrCode: string
  qrCodeBase64: string
  status: string
}

export async function createPixPayment(p: PixPayment): Promise<PixPaymentResult> {
  const resp = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.mercadopagoToken}`,
      "X-Idempotency-Key": p.orderId,
    },
    body: JSON.stringify({
      transaction_amount: p.amount,
      description: p.description,
      payment_method_id: "pix",
      payer: {
        email: p.email,
        first_name: p.firstName ? p.firstName.split(" ")[0] : undefined,
      },
      metadata: { order_id: p.orderId },
    }),
  })

  const data: any = await resp.json()

  if (!resp.ok) {
    console.error("[MP PIX ERROR]", JSON.stringify(data, null, 2))
    throw new Error(data.message ?? `MP API error ${resp.status}`)
  }

  return {
    id: data.id,
    qrCode: data.point_of_interaction?.transaction_data?.qr_code ?? "",
    qrCodeBase64: data.point_of_interaction?.transaction_data?.qr_code_base64 ?? "",
    status: data.status,
  }
}

export async function getPaymentStatus(paymentId: number): Promise<string> {
  const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${config.mercadopagoToken}` },
  })

  if (!resp.ok) throw new Error(`MP status API error ${resp.status}`)
  const data: any = await resp.json()
  return data.status
}
