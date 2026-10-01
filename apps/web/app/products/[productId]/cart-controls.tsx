'use client';

import { useState } from 'react';

type Option = { id: string; name: string; priceWon: number; sellableQuantity: number };
type ViewProps = { option: Option; quantity: number; busy: boolean; stopped?: boolean;
  onQuantityChange: (value: number) => void; onAdd: () => void };

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;

export function ProductCartControlsView({ option, quantity, busy, stopped = false,
  onQuantityChange, onAdd }: ViewProps) {
  const unavailable = stopped || option.sellableQuantity < 1;
  return <div className="detail-cart-option">
    <label htmlFor={`cart-qty-${option.id}`}>{option.name} 수량</label>
    <input id={`cart-qty-${option.id}`} type="number" min="1" max={option.sellableQuantity}
      step="1" inputMode="numeric" value={quantity}
      disabled={unavailable || busy} onChange={(event) => onQuantityChange(Number(event.target.value))} />
    <strong>{won(option.priceWon * (Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 0))}</strong>
    <button type="button" className="hero-button" disabled={unavailable || busy ||
      !Number.isSafeInteger(quantity) || quantity < 1 || quantity > option.sellableQuantity} onClick={onAdd}>
      {unavailable ? stopped ? '판매중지' : '품절' : busy ? '담는 중' : '장바구니에 담기'}
    </button>
  </div>;
}

export function ProductCartControls({ option, stopped = false }: { option: Option; stopped?: boolean }) {
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function add() {
    if (!apiOrigin || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/customer/cart/items/${encodeURIComponent(option.id)}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quantity }),
      });
      if (response.status === 401) throw new Error('로그인 후 장바구니를 이용해 주세요');
      if (response.status === 403) throw new Error('구매자 역할로 전환해 주세요');
      if (response.status === 409) throw new Error('상품 상태나 재고가 바뀌었습니다. 다시 확인해 주세요');
      if (!response.ok) throw new Error('장바구니에 담지 못했습니다');
      setMessage('장바구니에 담았습니다');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '장바구니에 담지 못했습니다');
    } finally { setBusy(false); }
  }
  return <div>
    <ProductCartControlsView option={option} quantity={quantity} busy={busy} stopped={stopped}
      onQuantityChange={setQuantity} onAdd={add} />
    {message ? <p role="status">{message} {message.includes('담았습니다') ? <a className="text-link" href="/cart">장바구니 보기</a> : null}</p> : null}
  </div>;
}
