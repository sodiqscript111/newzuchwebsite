export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("We couldn't reach the shop. Check your connection and try again.", 0);
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new ApiError(data?.message ?? "Something went wrong. Please try again.", response.status);
  }
  return data;
}

export const formatNaira = (amount) =>
  `₦${Number(amount).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const describeItemSize = (item) => {
  if (item.size) return `Size ${item.size}`;
  if (item.measurements) {
    const { chest, waist, hips, length } = item.measurements;
    return `Custom: chest ${chest}, waist ${waist}, hips ${hips}, length ${length} cm`;
  }
  return "";
};

export const ORDER_STATUS_LABELS = {
  awaiting_payment: "Awaiting payment",
  paid: "Paid",
  in_progress: "Being made",
  completed: "Completed",
  cancelled: "Cancelled",
  payment_failed: "Payment failed",
  expired: "Payment window expired",
};
