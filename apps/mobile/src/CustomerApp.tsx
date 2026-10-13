import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { CustomerApi, CustomerApiError, type Address, type AddressInput, type CartItem, type Order,
  type Preferences, type Product, type ProductSummary, type Question, type Quote, type Reservation } from './customer-api';

const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`;
type Screen = 'products' | 'product' | 'login' | 'cart' | 'orders' | 'profile' | 'questions';
const initialAddress: AddressInput = { label: '', recipientName: '', phone: '', postalCode: '', line1: '', line2: '', isDefault: true };
function Button({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress} style={[styles.button, disabled ? styles.disabled : undefined]}>
    <Text style={styles.buttonText}>{label}</Text></Pressable>;
}
function Field({ label, value, onChange, secret = false, numeric = false }: {
  label: string; value: string; onChange: (value: string) => void; secret?: boolean; numeric?: boolean;
}) {
  return <View style={styles.field}><Text>{label}</Text><TextInput accessibilityLabel={label}
    value={value} onChangeText={onChange} secureTextEntry={secret} autoCapitalize="none"
    autoCorrect={false} keyboardType={numeric ? 'number-pad' : 'default'} style={styles.input} /></View>;
}

export default function CustomerApp({ api, enableMockPayment = false, imageOrigin }: {
  api: CustomerApi; enableMockPayment?: boolean; imageOrigin?: string;
}) {
  const [screen, setScreen] = useState<Screen>('products');
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [product, setProduct] = useState<Product>();
  const [quantity, setQuantity] = useState('1');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [quote, setQuote] = useState<Quote>();
  const [reservation, setReservation] = useState<Reservation>();
  const [payable, setPayable] = useState<number>();
  const [coupon, setCoupon] = useState('');
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState('');
  const [address, setAddress] = useState<AddressInput>({ ...initialAddress });
  const [order, setOrder] = useState<Order>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderCursor, setOrderCursor] = useState<string | null>(null);
  const [lookupId, setLookupId] = useState('');
  const [preferences, setPreferences] = useState<Preferences>({ marketingEmail: false, marketingSms: false, push: false });
  const [questionText, setQuestionText] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [question, setQuestion] = useState<Question>();
  const clearPrivate = useCallback(() => {
    setSignedIn(false); setPassword(''); setCart([]); setQuote(undefined); setReservation(undefined);
    setPayable(undefined); setCoupon(''); setAddresses([]); setAddressId(''); setAddress({ ...initialAddress });
    setOrder(undefined); setOrders([]); setLookupId(''); setQuestions([]); setQuestion(undefined); setQuestionText('');
    setPreferences({ marketingEmail: false, marketingSms: false, push: false });
    setScreen('login');
  }, []);
  useEffect(() => {
    api.onSessionExpired = clearPrivate;
    return () => { api.onSessionExpired = undefined; };
  }, [api, clearPrivate]);

  const run = useCallback(async (task: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try { await task(); }
    catch (error) { setMessage(error instanceof CustomerApiError ? error.message : '처리를 완료하지 못했습니다. 다시 확인해 주세요.'); }
    finally { lock.current = false; setBusy(false); }
  }, []);
  const search = useCallback(async () => {
    const found = await api.products(query, 1); setProducts(found); setPage(1); setHasMore(found.length === 24);
  }, [api, query]);
  useEffect(() => { void run(async () => {
    const found = await api.products(); setProducts(found); setHasMore(found.length === 24);
  }); }, [api, run]);
  async function loadCart() {
    setQuote(undefined);
    const items = await api.cart(); setCart(items);
    const savedAddresses = await api.addresses(); setAddresses(savedAddresses);
    setAddressId(current => savedAddresses.some(a => a.id === current) ? current : savedAddresses[0]?.id ?? '');
    if (items.length) setQuote(await api.quote());
  }
  function navigate(next: Screen) {
    setMessage('');
    if (!signedIn && !['products', 'product', 'login'].includes(next)) {
      setScreen('login'); setMessage('로그인 후 이용할 수 있습니다.'); return;
    }
    setScreen(next);
    void run(async () => {
      if (next === 'products') await search();
      if (next === 'cart') await loadCart();
      if (next === 'orders') { const result = await api.orders(); setOrders(result.items); setOrderCursor(result.nextCursor); }
      if (next === 'profile') {
        const list = await api.addresses(); setAddresses(list); setPreferences(await api.preferences());
      }
      if (next === 'questions') { setQuestion(undefined); setQuestions((await api.questions()).items); }
    });
  }
  async function openOrder(id: string) { setOrder(undefined); setOrder(await api.order(id)); setLookupId(id); }
  const activeReservation = reservation?.status === 'ACTIVE';
  const canOrder = activeReservation && Date.parse(reservation.expiresAt) > Date.now() &&
    Boolean(addressId) && payable !== undefined && !order;

  return <SafeAreaView style={styles.container}>
    <View style={styles.header}><Text style={styles.title}>어울몰</Text>
      <Text>개발판 · 실제 결제·발송 아님</Text></View>
    <View style={styles.menu}>{(['products', 'cart', 'orders', 'questions', 'profile'] as Screen[]).map((next, i) =>
      <Button key={next} label={['상품', '장바구니', '주문·배송', '내 문의', '배송지·알림'][i]}
        disabled={busy} onPress={() => navigate(next)} />)}
      <Button label={signedIn ? '로그아웃' : '로그인'} disabled={busy}
        onPress={() => signedIn ? void run(async () => { await api.logout(); clearPrivate(); }) : navigate('login')} />
    </View>
    {busy ? <ActivityIndicator accessibilityLabel="처리 중" /> : null}
    {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {screen === 'products' ? <>
        <Text style={styles.heading}>상품 검색</Text><Field label="상품명·판매자 검색" value={query} onChange={setQuery} />
        <Button label="검색" disabled={busy} onPress={() => void run(search)} />
        {!busy && products.length === 0 ? <Text>판매 가능한 상품이 없습니다.</Text> : null}
        {products.map(item => <View key={item.productId} style={styles.card}>
          <Text style={styles.heading}>{item.title}</Text><Text>{item.originLabel} · {item.sellerName}</Text>
          <Text>{won(item.minPriceWon)}부터</Text>
          <Button label={`${item.title} 상세`} disabled={busy} onPress={() => void run(async () => {
            setProduct(await api.product(item.productId)); setQuantity('1'); setScreen('product');
          })} />
        </View>)}
        {hasMore ? <Button label="상품 더 보기" disabled={busy || page >= 1000} onPress={() => void run(async () => {
          const found = await api.products(query, page + 1); setProducts(previous => [...previous, ...found]);
          setPage(page + 1); setHasMore(found.length === 24);
        })} /> : null}
      </> : null}
      {screen === 'product' && product ? <>
        <Text style={styles.heading}>{product.title}</Text><Text>{product.originLabel} · {product.sellerName}</Text>
        <Text>{product.shippingMode === 'seller_direct' ? '판매자 직접 발송' : '어울몰 모아 발송'}</Text>
        {imageOrigin ? product.images?.map(image => <Image key={image.id} accessibilityLabel={`${product.title} 상품 사진`}
          style={styles.image} source={{ uri: `${imageOrigin}/catalog/products/${encodeURIComponent(product.productId)}/images/${encodeURIComponent(image.id)}` }} />) : null}
        <Text>{product.description}</Text><Field label="담을 수량" numeric value={quantity} onChange={setQuantity} />
        {product.options.map(option => <View key={option.id} style={styles.card}>
          <Text>{option.name} · {won(option.priceWon)} · 판매 가능 {option.sellableQuantity}개</Text>
          <Button label={`${option.name} 담기`} disabled={busy || product.saleStopped || option.sellableQuantity < Number(quantity) ||
            !Number.isSafeInteger(Number(quantity)) || Number(quantity) < 1} onPress={() => {
            if (!signedIn) { navigate('login'); return; }
            void run(async () => { await api.setCartItem(option.id, Number(quantity)); setMessage('장바구니에 저장했습니다.'); });
          }} />
        </View>)}
        <Field label="상품 문의" value={questionText} onChange={setQuestionText} />
        <Button label="문의 접수" disabled={busy || !questionText.trim()} onPress={() => {
          if (!signedIn) { navigate('login'); return; }
          void run(async () => { await api.askQuestion(product.productId, questionText); setQuestionText(''); setMessage('문의가 접수되었습니다. 내 문의에서 답변을 확인하세요.'); });
        }} />
      </> : null}
      {screen === 'login' ? <>
        <Text style={styles.heading}>구매자 로그인</Text>
        <Field label="이메일" value={email} onChange={setEmail} /><Field label="비밀번호" value={password} onChange={setPassword} secret />
        <Button label="구매자 로그인" disabled={busy || !email.trim() || !password} onPress={() => void run(async () => {
          try {
            await api.login(email, password); const actor = await api.me();
            if (actor.role !== 'customer') { clearPrivate(); throw new CustomerApiError('forbidden'); }
            setSignedIn(true); setScreen('products');
          } finally { setPassword(''); }
        })} />
        <Text>가입·비밀번호 복구의 실제 메일과 HTTPS 링크 확인은 인수테스트에 보류되어 있습니다.</Text>
      </> : null}
      {screen === 'cart' ? <>
        <Text style={styles.heading}>장바구니</Text>
        {cart.length === 0 ? <Text>장바구니가 비어 있습니다.</Text> : cart.map(item => <View key={item.optionId} style={styles.card}>
          <Text>{item.title} · {item.optionName} · {item.quantity}개</Text>
          <Text>{item.availability === 'available' && item.unitPriceWon !== null ? won(item.unitPriceWon) : '현재 구매 불가'}</Text>
          <Button label={`${item.optionName} 수량 늘리기`} disabled={busy || activeReservation} onPress={() => void run(async () => {
            await api.setCartItem(item.optionId, item.quantity + 1); await loadCart();
          })} />
          <Button label={`${item.optionName} 수량 줄이기`} disabled={busy || activeReservation || item.quantity <= 1} onPress={() => void run(async () => {
            await api.setCartItem(item.optionId, item.quantity - 1); await loadCart();
          })} />
          <Button label={`${item.optionName} 제거`} disabled={busy || activeReservation} onPress={() => void run(async () => {
            await api.removeCartItem(item.optionId); await loadCart();
          })} />
        </View>)}
        {quote ? <View style={styles.card}><Text>서버 견적 상품 {won(quote.goodsWon)} · 배송 {won(quote.shippingWon)}</Text>
          <Text style={styles.heading}>합계 {won(quote.totalWon)}</Text>
          {quote.shipments.map(shipment => <Text key={shipment.key}>발송 주문 {shipment.key} · 상품 {won(shipment.goodsWon)} · 배송 {won(shipment.shippingWon)}</Text>)}
        </View> : null}
        <Button label="재고 예약" disabled={busy || !quote || activeReservation} onPress={() => void run(async () => {
          const started = await api.reserve(); const held = await api.reservation(started.id);
          setReservation(held); setOrder(undefined); setCoupon('');
          if (held.status !== 'ACTIVE' || !held.quote) { setPayable(undefined); throw new CustomerApiError('conflict'); }
          setQuote(held.quote); setPayable(held.quote.totalWon);
        })} />
        {reservation ? <>
          <Text>예약 {reservation.status} · 만료 {reservation.expiresAt}</Text>
          <Button label="예약 해제" disabled={busy || !activeReservation || Boolean(order)} onPress={() => void run(async () => {
            setReservation(await api.release(reservation.id)); setPayable(undefined); await loadCart();
          })} />
          <Field label="상품 할인 쿠폰 코드" value={coupon} onChange={value => { setCoupon(value); setPayable(undefined); }} />
          <Button label="혜택 재견적" disabled={busy || !activeReservation || Boolean(order)} onPress={() => void run(async () => {
            const result = await api.promotionQuote(reservation.id, coupon.trim() ? { goodsCoupon: { code: coupon.trim() } } : {});
            setPayable(result.payableTotalWon); setMessage(`할인 ${won(result.discountWon)} · 배송 지원 ${won(result.supportWon)}`);
          })} />
        </> : null}
        <Text style={styles.heading}>배송지 선택</Text>
        {addresses.length === 0 ? <Text>배송지·알림 화면에서 배송지를 먼저 저장해 주세요.</Text> : addresses.map(item =>
          <Button key={item.id} label={`${addressId === item.id ? '선택됨 · ' : ''}${item.label} ${item.line1}`} disabled={busy || Boolean(order)} onPress={() => setAddressId(item.id)} />)}
        {payable !== undefined ? <Text>서버 확인 결제금액 {won(payable)}</Text> : null}
        <Button label="주문 생성" disabled={busy || !canOrder} onPress={() => void run(async () => {
          const created = await api.submitOrder({ reservationId: reservation!.id, addressId,
            expectedPayableWon: payable!, selections: coupon.trim() ? { goodsCoupon: { code: coupon.trim() } } : {} });
          setOrder(created); setLookupId(created.id);
        })} />
        {order ? <>
          <Text>주문 {order.id} · {order.status} · {won(order.payableWon)}</Text>
          <Text>모의 결제는 별도 격리·루프백 개발 서버에서만 가능합니다. 실제 PG 연동은 아닙니다.</Text>
          {enableMockPayment ? (['approve', 'decline', 'delay'] as const).map((outcome, i) =>
            <Button key={outcome} label={['모의 결제 승인', '모의 결제 거절', '모의 결제 지연'][i]} disabled={busy || order.status !== 'PENDING_PAYMENT'}
              onPress={() => void run(async () => {
                const result = await api.payMock(order.id, outcome); setMessage(`모의 처리 ${result.status} · 서버 주문 상태를 확인합니다.`);
                await openOrder(order.id);
              })} />) : <Text>이 앱 실행에서는 모의 결제 버튼이 비활성입니다.</Text>}
          <Button label="주문 상태 재조회" disabled={busy} onPress={() => void run(() => openOrder(order.id))} />
        </> : null}
      </> : null}
      {screen === 'orders' ? <>
        <Text style={styles.heading}>본인 결제 완료 주문·배송</Text>
        {orders.length === 0 ? <Text>결제 완료 주문이 없습니다.</Text> : orders.map(item => <Button key={item.id}
          label={`${item.id} · ${won(item.payableWon)}`} disabled={busy} onPress={() => void run(() => openOrder(item.id))} />)}
        {orderCursor ? <Button label="주문 더 보기" disabled={busy} onPress={() => void run(async () => {
          const result = await api.orders(orderCursor); setOrders(previous => [...previous, ...result.items]); setOrderCursor(result.nextCursor);
        })} /> : null}
        <Field label="본인 주문 번호" value={lookupId} onChange={setLookupId} />
        <Button label="주문·배송 조회" disabled={busy || !lookupId.trim()} onPress={() => void run(() => openOrder(lookupId.trim()))} />
        {order ? <View style={styles.card}><Text>주문 {order.status} · {won(order.payableWon)}</Text>
          {order.shipments.map(shipment => <View key={shipment.id} style={styles.card}>
            {shipment.lines.map(line => <Text key={line.optionId}>{line.productName} {line.optionName} {line.quantity}개</Text>)}
            <Text>출고 {shipment.fulfillment?.status ?? shipment.status}</Text>
            <Text>예상 출고일 {shipment.fulfillment?.expectedShipDate ?? '미등록'}</Text>
            <Text>{shipment.fulfillment?.carrier?.displayName ?? '택배사 미등록'} · {shipment.fulfillment?.trackingNumber ?? '운송장 미등록'}</Text>
            <Text>{shipment.fulfillment?.customerMessage ?? shipment.fulfillment?.delayedReason ?? ''}</Text>
          </View>)}
        </View> : null}
      </> : null}
      {screen === 'profile' ? <>
        <Text style={styles.heading}>배송지 저장</Text>
        {(['label', 'recipientName', 'phone', 'postalCode', 'line1', 'line2'] as const).map((field, i) =>
          <Field key={field} label={['배송지 이름', '받는 사람', '연락처', '우편번호', '주소', '상세 주소'][i]}
            value={address[field]} onChange={value => setAddress(previous => ({ ...previous, [field]: value }))} />)}
        <Button label="배송지 저장" disabled={busy} onPress={() => void run(async () => {
          await api.addAddress(address); setAddresses(await api.addresses()); setAddress({ ...initialAddress }); setMessage('배송지를 저장했습니다.');
        })} />
        {addresses.map(item => <Text key={item.id}>{item.label} · {item.line1}</Text>)}
        <Text style={styles.heading}>수신 동의 설정</Text>
        {(['marketingEmail', 'marketingSms'] as const).map((field, i) => <View key={field} style={styles.row}>
          <Text>{['이메일 수신 동의', '문자 수신 동의'][i]}</Text><Switch accessibilityLabel={['이메일 수신 동의', '문자 수신 동의'][i]}
            value={preferences[field]} disabled={busy} onValueChange={value => setPreferences(previous => ({ ...previous, [field]: value }))} />
        </View>)}
        <Text>기기 푸시 권한·실제 수신은 미확인입니다. 주문·내 문의에서 결과를 직접 확인하세요.</Text>
        <Button label="푸시 수신 동의 해제" disabled={busy || !preferences.push} onPress={() => setPreferences(previous => ({ ...previous, push: false }))} />
        <Button label="수신 설정 저장" disabled={busy} onPress={() => void run(async () => {
          await api.savePreferences(preferences); setPreferences(await api.preferences()); setMessage('서버 수신 설정을 저장했습니다. 실제 발송 시험은 아닙니다.');
        })} />
      </> : null}
      {screen === 'questions' ? <>
        <Text style={styles.heading}>내 상품 문의</Text>
        {questions.length === 0 ? <Text>접수한 문의가 없습니다.</Text> : questions.map(item => <Button key={item.id}
          label={`${item.status} · ${item.body}`} disabled={busy} onPress={() => void run(async () => setQuestion(await api.question(item.id)))} />)}
        {question ? <View style={styles.card}><Text>{question.body}</Text><Text>{question.status}</Text>
          {question.messages?.map(item => <Text key={item.id}>{item.authorRole} · {item.body}</Text>)}
        </View> : null}
      </> : null}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf7ef' }, header: { padding: 16 }, title: { fontSize: 26, color: '#302a20' },
  heading: { fontSize: 18, fontWeight: '600', marginVertical: 8 }, content: { padding: 16, paddingBottom: 40 },
  menu: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 }, button: { padding: 12, margin: 4, borderRadius: 8, backgroundColor: '#5b481f', minHeight: 44 },
  buttonText: { color: '#fff', fontSize: 16 }, disabled: { opacity: 0.5 }, field: { marginVertical: 8 },
  input: { borderWidth: 1, borderColor: '#716850', backgroundColor: '#fff', padding: 12, fontSize: 16, borderRadius: 6 },
  card: { padding: 12, marginVertical: 8, backgroundColor: '#fff', borderRadius: 8 }, message: { padding: 12, color: '#8b1d16' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }, image: { width: '100%', height: 220, resizeMode: 'contain' },
});
