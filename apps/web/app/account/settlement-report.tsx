const kinds = [
  ['sale', '상품 매출'], ['goods_discount', '상품 할인'],
  ['shipping_fee', '배송비'], ['shipping_support', '배송비 지원'],
  ['goods_refund', '상품 환불'], ['shipping_refund', '배송비 환불'],
  ['commission', '수수료'], ['correction', '정정'],
] as const;

type Kind = (typeof kinds)[number][0];
export type SettlementReport = {
  filter: { from: string; to: string; categoryId: string | null; sellerId: string | null };
  totals: Record<Kind, number>;
  groups: {
    sellerId: string; sellerName: string; sellerCategoryId: string; sellerCategoryName: string;
    totals: Record<Kind, number>;
    items: { id: string; kind: Kind; amountWon: number; occurredAt: string;
      checkoutOrderId: string | null; shipmentOrderId: string | null;
      productName: string | null; optionName: string | null }[];
  }[];
};

const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`;
const occurred = (value: string) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));

function Totals({ values }: { values: SettlementReport['totals'] }) {
  return <dl className="settlement-totals">
    {kinds.map(([kind, label]) => <div key={kind}>
      <dt>{label}</dt><dd>{won(values[kind])}</dd>
    </div>)}
  </dl>;
}

export function SettlementReportView({ report }: { report: SettlementReport }) {
  return <article className="settlement-print" aria-label="조회된 정산 자료">
    <header className="account-card profile-card">
      <h1>정산 자료</h1>
      <p>{report.filter.from} ~ {report.filter.to} 발생 기준</p>
      <p>판매자별 발생 금액을 구분해 표시합니다. 실제 송금은 시스템 밖에서 진행합니다.</p>
    </header>
    {report.groups.length === 0 ? <p className="account-card">조회 기간에 정산 자료가 없습니다.</p> : null}
    {report.groups.map((group) => <section className="account-card profile-card settlement-group"
      aria-label={`판매자 ${group.sellerName} 정산 자료`} key={group.sellerId}>
      <h2>{group.sellerName} <small>{group.sellerCategoryName}</small></h2>
      <div className="settlement-table-scroll"><table className="settlement-table">
        <thead><tr><th scope="col">발생 시점</th><th scope="col">항목</th>
          <th scope="col">상품·옵션</th><th scope="col">원주문 근거</th>
          <th scope="col">금액</th></tr></thead>
        <tbody>{group.items.map((item) => <tr key={item.id}>
          <td>{occurred(item.occurredAt)}</td>
          <td>{kinds.find(([kind]) => kind === item.kind)?.[1] ?? item.kind}</td>
          <td>{item.productName ? `${item.productName} · ${item.optionName}` : '발송 주문'}</td>
          <td>{item.checkoutOrderId ?? '별도 근거'}
            {item.shipmentOrderId ? <small> / {item.shipmentOrderId}</small> : null}</td>
          <td>{won(item.amountWon)}</td>
        </tr>)}</tbody>
      </table></div>
      <h3>{group.sellerName} 소계</h3><Totals values={group.totals} />
    </section>)}
    <section className="account-card profile-card settlement-overall" aria-label="전체 정산 자료 합계">
      <h2>전체 합계</h2><Totals values={report.totals} />
    </section>
  </article>;
}
