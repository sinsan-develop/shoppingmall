'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

type PublicAnswer = { questionId: string; question: string; answer: string };
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export function ProductQuestions({ productId,title }: { productId: string; title: string }) {
  const [answers,setAnswers] = useState<PublicAnswer[]>([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const keys = useRef(new Map<string,string>());

  useEffect(() => {
    const controller = new AbortController();
    if (!apiOrigin) { setLoading(false); return () => controller.abort(); }
    fetch(`${apiOrigin}/catalog/products/${encodeURIComponent(productId)}/questions`,
      { signal: controller.signal,cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Q&A unavailable');
        return response.json() as Promise<PublicAnswer[]>;
      }).then((items) => { if (!controller.signal.aborted) setAnswers(items); })
      .catch(() => { if (!controller.signal.aborted) setMessage('공개 문의를 불러오지 못했습니다'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [productId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiOrigin || busy) return;
    const form = event.currentTarget;
    const text = String(new FormData(form).get('text') ?? '').trim();
    if (!text) return;
    const identity = `${productId}|${text}`;
    const key = keys.current.get(identity) ?? crypto.randomUUID();
    keys.current.set(identity,key);
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/customer/support/questions`, {
        method: 'POST',credentials: 'include',headers: {
          'content-type': 'application/json','idempotency-key': key },
        body: JSON.stringify({ productId,text }),
      });
      if (response.status === 401 || response.status === 403) {
        setMessage('구매자 로그인 후 문의를 등록할 수 있습니다'); return;
      }
      if (response.status === 404) { setMessage('현재 공개 상품을 확인해 주세요'); return; }
      if (response.status === 409) { setMessage('같은 요청키의 다른 문의가 있습니다'); return; }
      if (!response.ok) { setMessage('접수 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요'); return; }
      keys.current.delete(identity);
      form.reset();
      setMessage('문의를 접수했습니다. 판매자 답변은 관리자 공개 승인 후 표시됩니다');
    } catch { setMessage('접수 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요'); }
    finally { setBusy(false); }
  }

  return <section className="detail-description" aria-labelledby="product-questions-title">
    <h2 id="product-questions-title">상품 문의</h2>
    <p>구매 전에도 문의할 수 있습니다. 질문과 판매자 답변은 관리자 공개 승인 후 Q&amp;A에 표시됩니다.</p>
    {loading ? <p role="status">공개 문의를 불러오는 중</p> : answers.length === 0 ?
      <p>공개된 문의가 없습니다.</p> : <ol>{answers.map((item) => <li key={item.questionId}>
        <p><strong>질문</strong> {item.question}</p><p><strong>답변</strong> {item.answer}</p>
      </li>)}</ol>}
    <form className="account-form" onSubmit={submit}>
      <label htmlFor="product-question-text">{title} 문의 내용</label>
      <textarea id="product-question-text" name="text" rows={4} maxLength={2000} required />
      <button type="submit" className="primary-button" disabled={busy || !apiOrigin}>문의 등록</button>
    </form>
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
