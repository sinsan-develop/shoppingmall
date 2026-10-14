import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import OrderSupport from './OrderSupport';
import AccountRequest from './AccountRequest';
import DeletionRequest from './DeletionRequest';
import CatalogHome from './CatalogHome';
import DeviceNotificationPanel from './DeviceNotificationPanel';
import { KakaoMockLogin } from './KakaoMockLogin';
import type { DeviceNotifications } from './device-notifications-core';
import { CustomerApi, CustomerApiError, type Address, type AddressInput, type CartItem, type Order,
  type Preferences, type Product, type ProductSummary, type Question, type Quote, type Reservation,
  type Favorite, type RestockSubscription, type CouponSelector, type HeldCoupon, type PromotionQuote, type OrderInput,
  type RefundCase, type RefundInput, type PickAttachment, type ProductFilters, type CatalogCategory, type CatalogSeller,
  type HomeContent, type HomeTarget, type HomeEventResult } from './customer-api';

const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`;
const sortNames = { latest: '최신순', price_asc: '낮은 가격순', price_desc: '높은 가격순' };
type Screen = 'home' | 'event' | 'products' | 'product' | 'login' | 'signup' | 'reset' | 'cart' | 'orders' | 'profile' | 'questions' | 'engagement';
const initialAddress: AddressInput = { label: '', recipientName: '', phone: '', postalCode: '', line1: '', line2: '', isDefault: true };
function Button({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress} style={[styles.button, disabled ? styles.disabled : undefined]}>
    <Text style={styles.buttonText}>{label}</Text></Pressable>;
}
function Field({ label, value, onChange, secret = false, numeric = false, disabled = false }: {
  label: string; value: string; onChange: (value: string) => void; secret?: boolean; numeric?: boolean; disabled?: boolean;
}) {
  return <View style={styles.field}><Text>{label}</Text><TextInput accessibilityLabel={label}
    value={value} onChangeText={onChange} editable={!disabled} secureTextEntry={secret} autoCapitalize="none"
    autoCorrect={false} keyboardType={numeric ? 'number-pad' : 'default'} style={styles.input} /></View>;
}

export default function CustomerApp({ api, enableMockPayment = false, imageOrigin, pickAttachment, notifications, enableMockNotifications = false, kakaoMock }: {
  api: CustomerApi; enableMockPayment?: boolean; imageOrigin?: string; pickAttachment?: PickAttachment;
  notifications?: DeviceNotifications; enableMockNotifications?: boolean;
  kakaoMock?: import('./kakao-mock-bridge').KakaoMockBridge;
}) {
  const [screen, setScreen] = useState<Screen>('products');
  const [signedIn, setSignedIn] = useState(false);
  const authGeneration = useRef(0);
  const cancelKakao=useRef<(()=>Promise<void>)|undefined>(undefined);
  const kakaoReady=useCallback((cancel:(()=>Promise<void>)|undefined)=>{cancelKakao.current=cancel;},[]);
  const kakaoBegin=useCallback(()=>{authGeneration.current++;},[]);
  const kakaoSignedIn=useCallback(()=>{authGeneration.current++;setSignedIn(true);setEmail('');setPassword('');setScreen('products');},[]);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [filters, setFilters] = useState<ProductFilters>({});
  const [appliedFilters, setAppliedFilters] = useState<ProductFilters>({});
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [sellers, setSellers] = useState<CatalogSeller[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [taxonomyBusy, setTaxonomyBusy] = useState(false);
  const taxonomyLoading = useRef(false);
  const [home, setHome] = useState<HomeContent>();
  const [homeEvent, setHomeEvent] = useState<HomeEventResult>();
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
  const [goodsGrantId, setGoodsGrantId] = useState('');
  const [coupons, setCoupons] = useState<HeldCoupon[]>([]);
  const [shippingChoices, setShippingChoices] = useState<Record<string, CouponSelector | undefined>>({});
  const [appliedPromotion, setAppliedPromotion] = useState<PromotionQuote>();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState('');
  const [address, setAddress] = useState<AddressInput>({ ...initialAddress });
  const [order, setOrder] = useState<Order>();
  const [viewedOrder, setViewedOrder] = useState<Order>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderCursor, setOrderCursor] = useState<string | null>(null);
  const [lookupId, setLookupId] = useState('');
  const [preferences, setPreferences] = useState<Preferences>({ marketingEmail: false, marketingSms: false, push: false });
  const [questionText, setQuestionText] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionCursor, setQuestionCursor] = useState<string | null>(null);
  const [question, setQuestion] = useState<Question>();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [restocks, setRestocks] = useState<RestockSubscription[]>([]);
  const [refundCases, setRefundCases] = useState<RefundCase[]>([]);
  const [refundsReady, setRefundsReady] = useState(false);
  const [refundShipmentId, setRefundShipmentId] = useState('');
  const [refundQuantities, setRefundQuantities] = useState<Record<string, string>>({});
  const [refundReason, setRefundReason] = useState('');
  const [refundReasonCode, setRefundReasonCode] = useState<RefundInput['reasonCode']>('customer_request');
  const [refundRetry, setRefundRetry] = useState<RefundInput>();
  const clearPrivate = useCallback(() => {
    authGeneration.current += 1;
    setSignedIn(false); setEmail(''); setPassword(''); setCart([]); setQuote(undefined); setReservation(undefined);
    setPayable(undefined); setCoupon(''); setAddresses([]); setAddressId(''); setAddress({ ...initialAddress });
    setGoodsGrantId(''); setCoupons([]); setShippingChoices({}); setAppliedPromotion(undefined);
    setOrder(undefined); setViewedOrder(undefined); setOrders([]); setLookupId(''); setQuestions([]); setQuestionCursor(null); setQuestion(undefined); setQuestionText('');
    setPreferences({ marketingEmail: false, marketingSms: false, push: false });
    setFavorites([]); setRestocks([]);
    setRefundCases([]); setRefundsReady(false); setRefundShipmentId(''); setRefundQuantities({});
    setRefundReason(''); setRefundReasonCode('customer_request'); setRefundRetry(undefined);
    setScreen('login');
  }, []);
  useEffect(() => {
    api.onSessionExpired = clearPrivate;
    return () => { api.onSessionExpired = undefined; };
  }, [api, clearPrivate]);
  useEffect(() => {
    let active = true;
    const generation = authGeneration.current;
    void api.me(false).then(actor => {
      if (!active || generation !== authGeneration.current) return;
      if (actor.role === 'customer') setSignedIn(true);
      else clearPrivate();
    }).catch(error => {
      if (!active || generation !== authGeneration.current) return;
      // Anonymous startup keeps public browsing available; private screens still require login.
      if (!(error instanceof CustomerApiError && error.code === 'unauthorized')) {
        setMessage('로그인 상태를 확인하지 못했습니다. 로그인 후 다시 확인해 주세요.');
      }
    });
    return () => { active = false; };
  }, [api, clearPrivate]);

  const run = useCallback(async (task: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try { await task(); }
    catch (error) { setMessage(error instanceof CustomerApiError ? error.message : '처리를 완료하지 못했습니다. 다시 확인해 주세요.'); }
    finally { lock.current = false; setBusy(false); }
  }, []);
  const loadTaxonomy = useCallback(async () => {
    if (taxonomyLoading.current) return;
    taxonomyLoading.current = true; setTaxonomyBusy(true);
    setCatalogError('');
    try { const [cats, farms] = await Promise.all([api.categories(), api.sellers()]); setCategories(cats); setSellers(farms); }
    catch { setCategories([]); setSellers([]); setCatalogError('분류·농가를 불러오지 못했습니다. 상품 검색은 계속 사용할 수 있습니다.'); }
    finally { taxonomyLoading.current = false; setTaxonomyBusy(false); }
  }, [api]);
  const applySearch = useCallback(async (value: string, chosen: ProductFilters) => {
    setProducts([]); setHasMore(false); setPage(1);
    const found = await api.products(value, 1, chosen); setProducts(found); setAppliedQuery(value); setAppliedFilters({ ...chosen }); setHasMore(found.length === 24);
  }, [api]);
  const search = useCallback(() => applySearch(query, filters), [applySearch, query, filters]);
  useEffect(() => { void loadTaxonomy(); void run(async () => {
    const found = await api.products(); setProducts(found); setHasMore(found.length === 24);
  }); }, [api, run, loadTaxonomy]);
  async function loadCart() {
    setQuote(undefined); invalidatePromotion();
    const items = await api.cart(); setCart(items);
    const savedAddresses = await api.addresses(); setAddresses(savedAddresses);
    setAddressId(current => savedAddresses.some(a => a.id === current) ? current : savedAddresses[0]?.id ?? '');
    const held = await api.activeReservation(); setReservation(held);
    if (held?.quote) {
      setQuote(held.quote);
      if (held.id !== reservation?.id) { resetSelection(); setPayable(held.quote.totalWon); }
      else if (!hasSelections) setPayable(held.quote.totalWon);
    }
    else { setPayable(undefined); if (items.length) setQuote(await api.quote()); }
    if (order) {
      const current = await api.order(order.id);
      if (current.status !== 'PENDING_PAYMENT') { setViewedOrder(current); setOrder(undefined); }
      else setOrder(current);
    }
    setCoupons([]); setCoupons(await api.coupons());
  }
  function invalidatePromotion() { setPayable(undefined); setAppliedPromotion(undefined); }
  function resetSelection() { setCoupon(''); setGoodsGrantId(''); setShippingChoices({}); invalidatePromotion(); }
  function selection(): OrderInput['selections'] {
    const goodsCoupon = goodsGrantId ? { grantId: goodsGrantId } : coupon.trim() ? { code: coupon.trim() } : undefined;
    const shippingCoupons = (quote?.shipments ?? []).flatMap(shipment => {
      const chosen = shippingChoices[shipment.key];
      return chosen ? [{ shipmentKey: shipment.key, ...chosen }] : [];
    });
    return { ...(goodsCoupon ? { goodsCoupon } : {}), ...(shippingCoupons.length ? { shippingCoupons } : {}) };
  }
  const hasSelections = Boolean(goodsGrantId || coupon.trim() || Object.values(shippingChoices).some(Boolean));
  function navigate(next: Screen) {
    setMessage('');
    if (!signedIn && !['home', 'event', 'products', 'product', 'login', 'signup', 'reset'].includes(next)) {
      setScreen('login'); setMessage('로그인 후 이용할 수 있습니다.'); return;
    }
    setScreen(next);
    void run(async () => {
      if (next === 'products') await search();
      if (next === 'home') { setHome(undefined); void loadTaxonomy(); setHome(await api.home()); }
      if (next === 'cart') await loadCart();
      if (next === 'orders') { const result = await api.orders(); setOrders(result.items); setOrderCursor(result.nextCursor); }
      if (next === 'profile') {
        const list = await api.addresses(); setAddresses(list); setPreferences(await api.preferences());
      }
      if (next === 'questions') { const result = await api.questions(); setQuestion(undefined); setQuestions(result.items); setQuestionCursor(result.nextCursor); }
      if (next === 'engagement') { setFavorites([]); setRestocks([]); await loadEngagement(); }
    });
  }
  async function chooseHome(target: HomeTarget) {
    if (target.type === 'home') { setHome(undefined); setHome(await api.home()); return; }
    if (target.type === 'product') { await openProduct(target.id); return; }
    if (target.type === 'event') { setHomeEvent(undefined); setScreen('event'); setHomeEvent(await api.homeEvent(target.id)); return; }
    const chosen: ProductFilters = target.type === 'category' ? { categoryId: target.id } : target.type === 'seller' ? { sellerId: target.id } : {};
    setQuery(''); setFilters(chosen); setScreen('products'); await applySearch('', chosen);
  }
  async function loadEngagement() {
    const savedFavorites = await api.favorites();
    const savedRestocks = await api.restockSubscriptions();
    setFavorites(savedFavorites); setRestocks(savedRestocks);
  }
  async function openProduct(id: string) {
    setProduct(undefined); setProduct(await api.product(id)); setQuantity('1'); setScreen('product');
  }
  async function openOrder(id: string) {
    setViewedOrder(undefined); setRefundCases([]); setRefundsReady(false); setRefundShipmentId('');
    setRefundQuantities({}); setRefundReason(''); setRefundReasonCode('customer_request'); setRefundRetry(undefined);
    const found = await api.order(id); setViewedOrder(found); setLookupId(id);
    if (found.status === 'PAID') { setRefundCases(await api.refunds(id)); setRefundsReady(true); }
  }
  async function refreshRefunds() {
    if (!viewedOrder) return;
    setRefundsReady(false); setRefundCases([]);
    setRefundCases(await api.refunds(viewedOrder.id)); setRefundsReady(true);
  }
  const refundShipment = viewedOrder?.shipments.find(item => item.id === refundShipmentId);
  const preShipment = (shipment: Order['shipments'][number]) => shipment.status === 'PAID' &&
    ['READY', 'PACKING', 'DELAYED'].includes(shipment.fulfillment?.status ?? '');
  const refundPending = refundCases.some(item => item.shipmentOrderId === refundShipmentId &&
    !['REFUNDED', 'REJECTED'].includes(item.status));
  const validRefundQuantities = Boolean(refundShipment) && refundShipment!.lines.every(line => {
    const value = Number(refundQuantities[line.optionId] ?? '0');
    return Number.isSafeInteger(value) && value >= 0 && value <= line.quantity;
  });
  const refundLines = refundShipment?.lines.map(line => ({ optionId: line.optionId,
    quantity: Number(refundQuantities[line.optionId] ?? '0') })).filter(line => line.quantity > 0) ?? [];
  const canRefund = viewedOrder?.status === 'PAID' && refundsReady && refundShipment && preShipment(refundShipment) &&
    !refundPending && validRefundQuantities && refundLines.length > 0 && refundReason.trim().length > 0 && refundReason.trim().length <= 500;
  async function refreshCheckout() {
    if (!order) return;
    const current = await api.order(order.id);
    if (current.status !== 'PENDING_PAYMENT') { setViewedOrder(current); setOrder(undefined); }
    else setOrder(current);
    await loadCart();
  }
  const activeReservation = reservation?.status === 'ACTIVE';
  const canOrder = activeReservation && Date.parse(reservation.expiresAt) > Date.now() &&
    Boolean(addressId) && payable !== undefined && !order;

  return <SafeAreaView style={styles.container}>
    <View style={styles.header}><Text style={styles.title}>어울몰</Text>
      <Text>개발판 · 실제 결제·발송 아님</Text></View>
    <View style={styles.menu}>{(['products', 'cart', 'orders', 'questions', 'profile', 'engagement'] as Screen[]).map((next, i) =>
      <Button key={next} label={['상품', '장바구니', '주문·배송', '내 문의', '배송지·알림', '찜·재입고'][i]}
        disabled={busy} onPress={() => navigate(next)} />)}
      <Button label="홈" disabled={busy} onPress={() => navigate('home')} />
      <Button label={signedIn ? '로그아웃' : '로그인'} disabled={busy}
        onPress={() => signedIn ? void run(async () => { await cancelKakao.current?.(); authGeneration.current += 1; await api.logout(); clearPrivate(); }) : navigate('login')} />
    </View>
    {busy ? <ActivityIndicator accessibilityLabel="처리 중" /> : null}
    {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {screen === 'home' ? <CatalogHome content={home} categories={categories} sellers={sellers} busy={busy} imageOrigin={imageOrigin}
        choose={target => void run(() => chooseHome(target))} /> : null}
      {screen === 'event' ? <>
        {homeEvent ? 'status' in homeEvent ? <Text>{homeEvent.message}</Text> : <>
          <Text style={styles.heading}>{homeEvent.title}</Text><Text>{homeEvent.description}</Text>
          {homeEvent.products.map(item => <Button key={item.productId} label={`기획전 상품 ${item.title}`} disabled={busy}
            onPress={() => void run(() => openProduct(item.productId))} />)}
        </> : <Text>기획전 정보를 다시 확인해 주세요.</Text>}
        <Button label="전체 상품 둘러보기" disabled={busy} onPress={() => void run(() => chooseHome({ type: 'catalog' }))} />
      </> : null}
      {screen === 'products' ? <>
        <Text style={styles.heading}>상품 검색</Text><Field label="상품명·판매자 검색" value={query} onChange={setQuery} />
        <Text>상품 분류·농가·정렬을 선택한 뒤 검색을 누르세요.</Text>
        <Button label="전체 분류" disabled={busy} onPress={() => setFilters(previous => ({ ...previous, categoryId: undefined }))} />
        {categories.map(item => <Button key={item.id} label={`분류 ${item.parentId ? `${categories.find(parent => parent.id === item.parentId)?.name ?? ''} > ` : ''}${item.name}`}
          disabled={busy} onPress={() => setFilters(previous => ({ ...previous, categoryId: item.id }))} />)}
        <Button label="전체 농가" disabled={busy} onPress={() => setFilters(previous => ({ ...previous, sellerId: undefined }))} />
        {sellers.map(item => <Button key={item.id} label={`농가 ${item.displayName}`} disabled={busy}
          onPress={() => setFilters(previous => ({ ...previous, sellerId: item.id }))} />)}
        {(['latest', 'price_asc', 'price_desc'] as const).map((sort, i) => <Button key={sort} label={['최신순', '낮은 가격순', '높은 가격순'][i]}
          disabled={busy} onPress={() => setFilters(previous => ({ ...previous, sort }))} />)}
        <Text>선택 조건 분류 {filters.categoryId ? categories.find(item => item.id === filters.categoryId)?.name ?? '선택한 분류' : '전체'} · 농가 {filters.sellerId ? sellers.find(item => item.id === filters.sellerId)?.displayName ?? '선택한 농가' : '전체'} · 정렬 {sortNames[filters.sort ?? 'latest']}</Text>
        {catalogError ? <Text>{catalogError}</Text> : null}
        {taxonomyBusy ? <Text>분류·농가를 불러오는 중입니다. 상품 검색은 계속 사용할 수 있습니다.</Text> : null}
        <Button label="분류·농가 새로고침" disabled={taxonomyBusy} onPress={() => void loadTaxonomy()} />
        <Button label="검색" disabled={busy} onPress={() => void run(search)} />
        <Text>적용 조건 검색 {appliedQuery || '전체'} · 분류 {appliedFilters.categoryId ? categories.find(item => item.id === appliedFilters.categoryId)?.name ?? '선택한 분류' : '전체'} · 농가 {appliedFilters.sellerId ? sellers.find(item => item.id === appliedFilters.sellerId)?.displayName ?? '선택한 농가' : '전체'} · 정렬 {sortNames[appliedFilters.sort ?? 'latest']}</Text>
        {!busy && products.length === 0 ? <Text>판매 가능한 상품이 없습니다.</Text> : null}
        {products.map(item => <View key={item.productId} style={styles.card}>
          <Text style={styles.heading}>{item.title}</Text><Text>{item.originLabel} · {item.sellerName}</Text>
          <Text>{won(item.minPriceWon)}부터</Text>
          <Button label={`${item.title} 상세`} disabled={busy} onPress={() => void run(() => openProduct(item.productId))} />
        </View>)}
        {hasMore ? <Button label="상품 더 보기" disabled={busy || page >= 1000} onPress={() => void run(async () => {
          const found = await api.products(appliedQuery, page + 1, appliedFilters); setProducts(previous => [...previous, ...found]);
          setPage(page + 1); setHasMore(found.length === 24);
        })} /> : null}
      </> : null}
      {screen === 'product' && product ? <>
        <Text style={styles.heading}>{product.title}</Text><Text>{product.originLabel} · {product.sellerName}</Text>
        <Text>{product.shippingMode === 'seller_direct' ? '판매자 직접 발송' : '어울몰 모아 발송'}</Text>
        {imageOrigin ? product.images?.map(image => <Image key={image.id} accessibilityLabel={`${product.title} 상품 사진`}
          style={styles.image} source={{ uri: `${imageOrigin}/catalog/products/${encodeURIComponent(product.productId)}/images/${encodeURIComponent(image.id)}` }} />) : null}
        <Text>{product.description}</Text><Field label="담을 수량" numeric value={quantity} onChange={setQuantity} />
        <Button label="찜 추가" disabled={busy} onPress={() => {
          if (!signedIn) { navigate('login'); return; }
          void run(async () => { await api.addFavorite(product.productId); setMessage('찜에 저장했습니다.'); });
        }} />
        {product.options.map(option => <View key={option.id} style={styles.card}>
          <Text>{option.name} · {won(option.priceWon)} · 판매 가능 {option.sellableQuantity}개</Text>
          <Button label={`${option.name} 담기`} disabled={busy || product.saleStopped || option.sellableQuantity < Number(quantity) ||
            !Number.isSafeInteger(Number(quantity)) || Number(quantity) < 1} onPress={() => {
            if (!signedIn) { navigate('login'); return; }
            void run(async () => { await api.setCartItem(option.id, Number(quantity)); setMessage('장바구니에 저장했습니다.'); });
          }} />
          {option.sellableQuantity === 0 && !product.saleStopped ? <Button label={`${option.name} 재입고 신청`} disabled={busy}
            onPress={() => {
              if (!signedIn) { navigate('login'); return; }
              void run(async () => { await api.subscribeRestock(product.productId, option.id);
                setMessage('재입고 신청을 저장했습니다. 신청 상태는 찜·재입고에서 확인하세요. 실제 알림 수신은 미확인입니다.'); });
            }} /> : null}
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
          await cancelKakao.current?.();
          authGeneration.current += 1;
          try {
            await api.login(email, password); const actor = await api.me();
            if (actor.role !== 'customer') { clearPrivate(); throw new CustomerApiError('forbidden'); }
            setSignedIn(true); setScreen('products');
          } finally { setPassword(''); }
        })} />
        <Button label="가입하기" disabled={busy} onPress={() => navigate('signup')} />
        {kakaoMock?<KakaoMockLogin bridge={kakaoMock} onBegin={kakaoBegin} onSignedIn={kakaoSignedIn} onReady={kakaoReady}/>:null}
        <Button label="비밀번호 찾기" disabled={busy} onPress={() => navigate('reset')} />
        <Text>가입·비밀번호 복구의 실제 메일과 HTTPS 링크 확인은 인수테스트에 보류되어 있습니다.</Text>
      </> : null}
      {screen === 'signup' || screen === 'reset' ? <AccountRequest key={screen} api={api} kind={screen} busy={busy} run={run}
        back={() => navigate('login')} /> : null}
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
          setReservation(held); setOrder(undefined); resetSelection();
          if (held.status !== 'ACTIVE' || !held.quote) { setPayable(undefined); throw new CustomerApiError('conflict'); }
          setQuote(held.quote); setPayable(held.quote.totalWon);
        })} />
        {reservation ? <>
          <Text>예약 {reservation.status} · 만료 {reservation.expiresAt}</Text>
          <Button label="예약 해제" disabled={busy || !activeReservation || Boolean(order)} onPress={() => void run(async () => {
            setReservation(await api.release(reservation.id)); setPayable(undefined); await loadCart();
          })} />
          <Text style={styles.heading}>상품 할인 쿠폰</Text>
          <Text>보유 쿠폰과 입력 코드는 동시에 적용하지 않습니다. 혜택은 서버에서 다시 계산합니다.</Text>
          {coupons.filter(item => item.rule.kind === 'goods_discount').map(item => <View key={item.grantId}>
            <Button label={`상품 쿠폰 ${item.title}`} disabled={busy || !activeReservation || Boolean(order)}
              onPress={() => { setGoodsGrantId(item.grantId); setCoupon(''); invalidatePromotion(); }} />
            {goodsGrantId === item.grantId ? <Text>선택됨 · {item.title}</Text> : null}
          </View>)}
          <Field label="상품 할인 쿠폰 코드" value={coupon} disabled={busy || !activeReservation || Boolean(order)}
            onChange={value => { setCoupon(value); setGoodsGrantId(''); invalidatePromotion(); }} />
          <Button label="상품 쿠폰 사용 안 함" disabled={busy || !activeReservation || Boolean(order)}
            onPress={() => { setCoupon(''); setGoodsGrantId(''); invalidatePromotion(); }} />
          {quote?.shipments.map(shipment => <View key={shipment.key} style={styles.card}>
            <Text>발송 {shipment.key} 배송 지원</Text>
            {shipment.shippingWon === 0 ? <Text>무료배송 묶음에는 배송 지원을 적용하지 않습니다.</Text> : <>
              {coupons.filter(item => item.rule.kind === 'shipping_support').map(item => <View key={item.grantId}>
                <Button label={`배송 ${shipment.key} 쿠폰 ${item.title}`} disabled={busy || !activeReservation || Boolean(order)}
                  onPress={() => { setShippingChoices(previous => ({ ...previous, [shipment.key]: { grantId: item.grantId } })); invalidatePromotion(); }} />
                {shippingChoices[shipment.key]?.grantId === item.grantId ? <Text>선택됨 · {item.title}</Text> : null}
              </View>)}
              <Field label={`배송 ${shipment.key} 지원 코드`} value={shippingChoices[shipment.key]?.code ?? ''}
                disabled={busy || !activeReservation || Boolean(order)} onChange={value => {
                  setShippingChoices(previous => ({ ...previous, [shipment.key]: value.trim() ? { code: value.trim() } : undefined }));
                  invalidatePromotion();
                }} />
              <Button label={`배송 ${shipment.key} 지원 사용 안 함`} disabled={busy || !activeReservation || Boolean(order)}
                onPress={() => { setShippingChoices(previous => ({ ...previous, [shipment.key]: undefined })); invalidatePromotion(); }} />
            </>}
          </View>)}
          <Button label="혜택 재견적" disabled={busy || !activeReservation || Boolean(order)} onPress={() => void run(async () => {
            invalidatePromotion();
            const result = await api.promotionQuote(reservation.id, selection());
            setAppliedPromotion(result); setPayable(result.payableTotalWon); setMessage(`할인 ${won(result.discountWon)} · 배송 지원 ${won(result.supportWon)}`);
          })} />
          {appliedPromotion ? <View style={styles.card}>
            {appliedPromotion.shipments.map(shipment => <Text key={shipment.key}>발송 {shipment.key} · 상품 할인 {won(shipment.discountWon)} ·
              배송 지원 {won(shipment.supportWon)} · 결제 소계 {won(shipment.payableTotalWon)}</Text>)}
            {appliedPromotion.message ? <Text>{appliedPromotion.message}</Text> : null}
            <Text>견적이며 주문·결제 완료가 아닙니다.</Text>
          </View> : null}
        </> : null}
        <Text style={styles.heading}>배송지 선택</Text>
        {addresses.length === 0 ? <Text>배송지·알림 화면에서 배송지를 먼저 저장해 주세요.</Text> : addresses.map(item =>
          <Button key={item.id} label={`${addressId === item.id ? '선택됨 · ' : ''}${item.label} ${item.line1}`} disabled={busy || Boolean(order)} onPress={() => setAddressId(item.id)} />)}
        {payable !== undefined ? <Text>서버 확인 결제금액 {won(payable)}</Text> : null}
        <Button label="주문 생성" disabled={busy || !canOrder} onPress={() => void run(async () => {
          const created = await api.submitOrder({ reservationId: reservation!.id, addressId,
            expectedPayableWon: payable!, selections: selection() });
          setOrder(created); setLookupId(created.id);
        })} />
        {order ? <>
          <Text>주문 {order.id} · {order.status} · {won(order.payableWon)}</Text>
          <Text>모의 결제는 별도 격리·루프백 개발 서버에서만 가능합니다. 실제 PG 연동은 아닙니다.</Text>
          {enableMockPayment ? (['approve', 'decline', 'delay'] as const).map((outcome, i) =>
            <Button key={outcome} label={['모의 결제 승인', '모의 결제 거절', '모의 결제 지연'][i]} disabled={busy || order.status !== 'PENDING_PAYMENT'}
              onPress={() => void run(async () => {
                const result = await api.payMock(order.id, outcome); setMessage(`모의 처리 ${result.status} · 서버 주문 상태를 확인합니다.`);
                await refreshCheckout();
              })} />) : <Text>이 앱 실행에서는 모의 결제 버튼이 비활성입니다.</Text>}
          <Button label="주문 상태 재조회" disabled={busy} onPress={() => void run(refreshCheckout)} />
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
        {viewedOrder ? <View style={styles.card}><Text>주문 {viewedOrder.status} · {won(viewedOrder.payableWon)}</Text>
          {viewedOrder.shipments.map(shipment => <View key={shipment.id} style={styles.card}>
            {shipment.lines.map(line => <Text key={line.optionId}>{line.productName} {line.optionName} {line.quantity}개</Text>)}
            <Text>출고 {shipment.fulfillment?.status ?? shipment.status}</Text>
            <Text>예상 출고일 {shipment.fulfillment?.expectedShipDate ?? '미등록'}</Text>
            <Text>{shipment.fulfillment?.carrier?.displayName ?? '택배사 미등록'} · {shipment.fulfillment?.trackingNumber ?? '운송장 미등록'}</Text>
            <Text>{shipment.fulfillment?.customerMessage ?? shipment.fulfillment?.delayedReason ?? ''}</Text>
            {viewedOrder.status === 'PAID' && preShipment(shipment) ? <Button label={`발송 ${shipment.id} 취소·환불 선택`}
              disabled={busy || !refundsReady || Boolean(refundRetry)} onPress={() => {
                setRefundShipmentId(shipment.id); setRefundQuantities({}); setRefundReason(''); setRefundReasonCode('customer_request');
              }} /> : viewedOrder.status === 'PAID' ? <Text>출고 후에는 클레임 경로를 이용합니다. 출고 상태가 미확인인 경우 다시 조회해 주세요.</Text> : null}
          </View>)}
          {viewedOrder.status === 'PAID' ? <>
            <OrderSupport key={viewedOrder.id} api={api} order={viewedOrder} busy={busy} run={run} pickAttachment={pickAttachment} />
            <Text style={styles.heading}>출고 전 취소·환불 요청</Text>
            <Text>요청 접수는 환불 완료가 아닙니다. 출고 여부와 실제 결제금액은 서버·담당자가 확인합니다.</Text>
            <Button label="환불 내역 새로고침" disabled={busy} onPress={() => void run(refreshRefunds)} />
            {refundShipment ? <View style={styles.card}>
              {refundShipment.lines.map(line => <Field key={line.optionId} label={`${line.optionName} 취소 수량`} numeric
                value={refundQuantities[line.optionId] ?? '0'} disabled={busy || refundPending || Boolean(refundRetry)}
                onChange={value => setRefundQuantities(previous => ({ ...previous, [line.optionId]: value }))} />)}
              <Text>0은 제외, 결제 수량 이내의 정수만 접수합니다.</Text>
              {(['customer_request', 'other'] as const).map((code, i) => <Button key={code}
                label={['구매자 요청 사유', '기타 사유'][i]} disabled={busy || refundPending || Boolean(refundRetry)}
                onPress={() => setRefundReasonCode(code)} />)}
              <Text>선택 사유: {refundReasonCode === 'customer_request' ? '구매자 요청' : '기타'}</Text>
              <Field label="취소 상세 사유" value={refundReason} disabled={busy || refundPending || Boolean(refundRetry)} onChange={setRefundReason} />
              {refundRetry ? <Text>접수 결과가 불명확합니다. 입력을 유지한 채 같은 요청으로 재시도합니다.</Text> : null}
              {refundPending ? <Text>이 발송 주문의 기존 요청을 처리 중입니다.</Text> : null}
              <Button label="취소·환불 요청 접수" disabled={busy || !canRefund} onPress={() => void run(async () => {
                const input: RefundInput = refundRetry ?? { shipmentOrderId: refundShipment.id, lines: refundLines,
                  reasonCode: refundReasonCode, reason: refundReason.trim() };
                try {
                  const created = await api.requestRefund(viewedOrder.id, input);
                  setRefundCases(previous => [...previous.filter(item => item.id !== created.id), created]);
                  setRefundRetry(undefined); setRefundQuantities({}); setRefundReason('');
                  setMessage('요청 접수 · 환불 완료 아님. 처리 내역을 다시 확인하세요.');
                } catch (error) {
                  if (error instanceof CustomerApiError && error.code === 'offline') setRefundRetry(input);
                  throw error;
                }
              })} />
            </View> : null}
            {refundCases.map(item => <View key={item.id} style={styles.card}>
              <Text>환불 요청 {item.id} · {item.status}</Text><Text>{item.reason}</Text>
              <Text>{item.status === 'REFUNDED' ? '환불 완료 · ' : item.amountFinal ? '확정 환불액 ' : '예상 환불액 '}
                {item.amountFinal || item.estimateAvailable ? won(item.totalRefundWon) : '서버 확인 중'}</Text>
              {item.lines.map(line => <Text key={line.optionId}>{line.productName} {line.optionName} {line.quantity}개</Text>)}
              {item.history.map((event, i) => <Text key={i}>{event.toStatus} · {event.createdAt}</Text>)}
            </View>)}
          </> : null}
        </View> : null}
      </> : null}
      {screen === 'engagement' ? <>
        <Text style={styles.heading}>내 찜 상품</Text>
        {!busy && favorites.length === 0 ? <Text>찜한 상품이 없습니다.</Text> : null}
        {favorites.map(item => <View key={item.productId} style={styles.card}>
          <Text>{item.title ?? '현재 비공개 상품'}</Text>
          {!item.published ? <Text>비공개 상품</Text> : item.saleStopped ? <Text>판매 중지 상품</Text> : null}
          <Button label={`${item.title ?? '현재 비공개 상품'} 상세`} disabled={busy || !item.published}
            onPress={() => void run(() => openProduct(item.productId))} />
          <Button label={`${item.title ?? '현재 비공개 상품'} 찜 제거`} disabled={busy}
            onPress={() => void run(async () => { await api.removeFavorite(item.productId); await loadEngagement(); })} />
        </View>)}
        <Text style={styles.heading}>내 재입고 신청</Text>
        <Text>신청 상태를 서버에서 조회합니다. 실제 푸시·메일 수신 시험은 아닙니다.</Text>
        {!busy && restocks.length === 0 ? <Text>재입고 신청이 없습니다.</Text> : null}
        {restocks.map(item => <View key={item.id} style={styles.card}>
          <Text>{item.title ?? '현재 비공개 상품'} · {item.optionName}</Text>
          <Text>{{ active: '신청 중', cancelled: '신청 취소됨', notified: '알림 처리됨 · 실제 수신 미확인' }[item.status]}</Text>
          <Text>{{ unpublished: '비공개 상품', sale_stopped: '판매 중지', missing: '현재 옵션 없음',
            available: '현재 구매 가능', sold_out: '현재 품절' }[item.optionState]}</Text>
          {item.optionState === 'available' ? <Button label={`${item.optionName} 상품 보기`} disabled={busy}
            onPress={() => void run(() => openProduct(item.productId))} /> : null}
          {item.status === 'active' ? <Button label={`${item.optionName} 재입고 취소`} disabled={busy}
            onPress={() => void run(async () => { await api.cancelRestock(item.id); await loadEngagement(); })} /> : null}
        </View>)}
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
        <DeletionRequest api={api} busy={busy} run={run} />
        <Text style={styles.heading}>수신 동의 설정</Text>
        {(['marketingEmail', 'marketingSms'] as const).map((field, i) => <View key={field} style={styles.row}>
          <Text>{['이메일 수신 동의', '문자 수신 동의'][i]}</Text><Switch accessibilityLabel={['이메일 수신 동의', '문자 수신 동의'][i]}
            value={preferences[field]} disabled={busy} onValueChange={value => setPreferences(previous => ({ ...previous, [field]: value }))} />
        </View>)}
        {notifications ? <DeviceNotificationPanel notifications={notifications} enableMock={enableMockNotifications} /> :
          <Text>기기 푸시 권한·실제 수신은 미확인입니다. 주문·내 문의에서 결과를 직접 확인하세요.</Text>}
        <Button label="푸시 수신 동의 해제" disabled={busy || !preferences.push} onPress={() => setPreferences(previous => ({ ...previous, push: false }))} />
        <Button label="수신 설정 저장" disabled={busy} onPress={() => void run(async () => {
          await api.savePreferences(preferences); setPreferences(await api.preferences()); setMessage('서버 수신 설정을 저장했습니다. 실제 발송 시험은 아닙니다.');
        })} />
      </> : null}
      {screen === 'questions' ? <>
        <Text style={styles.heading}>내 상품 문의</Text>
        {questions.length === 0 ? <Text>접수한 문의가 없습니다.</Text> : questions.map(item => <Button key={item.id}
          label={`${item.status} · ${item.body}`} disabled={busy} onPress={() => void run(async () => setQuestion(await api.question(item.id)))} />)}
        {questionCursor ? <Button label="문의 더 보기" disabled={busy} onPress={() => void run(async () => {
          const result = await api.questions(questionCursor); setQuestions(previous => [...previous, ...result.items]); setQuestionCursor(result.nextCursor);
        })} /> : null}
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
