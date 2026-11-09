import PropTypes from "prop-types";
import { describeItemSize, formatNaira, ORDER_STATUS_LABELS } from "../../api";

const formatDate = (iso) =>
  new Date(iso).toLocaleString("en-NG", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });

const NEXT_STEP = {
  awaiting_payment: "We're waiting for your payment to be confirmed. This page updates by itself.",
  paid: "Payment received. We'll start on your order soon.",
  in_progress: "We're working on your order.",
  completed: "Your order is complete. Thank you for shopping with Zuch.",
  cancelled: "This order was cancelled. Contact us if you have questions.",
  payment_failed: "The payment didn't go through. You can try again from your cart.",
  expired: "The payment window closed before payment was made. You can order again from your cart.",
};

const OrderDetails = ({ order }) => (
  <article className="order-details">
    <header className="order-header">
      <div>
        <p className="shop-muted">Order</p>
        <h1>{order.number}</h1>
      </div>
      <span className={`order-status status-${order.status}`}>{ORDER_STATUS_LABELS[order.status]}</span>
    </header>
    <p className="order-next">{NEXT_STEP[order.status]}</p>

    <ul className="order-items">
      {order.items.map((item, index) => (
        <li key={index}>
          {item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span className="order-noimage" />}
          <div>
            <p>
              {item.quantity > 1 && <strong>{item.quantity} × </strong>}
              {item.name}
            </p>
            <p className="shop-muted">{describeItemSize(item)}</p>
          </div>
          <span>{formatNaira(item.unitPrice * item.quantity)}</span>
        </li>
      ))}
    </ul>

    <div className="checkout-total">
      <span>Total</span>
      <strong>{formatNaira(order.total)}</strong>
    </div>

    <dl className="order-meta">
      <dt>Placed</dt>
      <dd>{formatDate(order.createdAt)}</dd>
      {order.paidAt && (
        <>
          <dt>Paid</dt>
          <dd>{formatDate(order.paidAt)}</dd>
        </>
      )}
      <dt>Deliver to</dt>
      <dd>
        {order.name}
        <br />
        {order.address}
      </dd>
      <dt>Contact</dt>
      <dd>
        {order.email}
        <br />
        {order.phone}
      </dd>
    </dl>
  </article>
);

OrderDetails.propTypes = {
  order: PropTypes.shape({
    number: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    total: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    email: PropTypes.string.isRequired,
    phone: PropTypes.string.isRequired,
    address: PropTypes.string.isRequired,
    createdAt: PropTypes.string.isRequired,
    paidAt: PropTypes.string,
    items: PropTypes.arrayOf(PropTypes.object).isRequired,
  }).isRequired,
};

export default OrderDetails;
