import { Image, Pressable, Text, View } from 'react-native';
import type { CatalogCategory, CatalogSeller, HomeContent, HomeTarget } from './customer-api';

export default function CatalogHome({ content, categories, sellers, busy, choose, imageOrigin }: {
  content?: HomeContent; categories: CatalogCategory[]; sellers: CatalogSeller[]; busy: boolean;
  choose: (target: HomeTarget) => void; imageOrigin?: string;
}) {
  function action(label: string, target: HomeTarget, key?: string) {
    return <Pressable key={key} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: busy }} disabled={busy}
      onPress={() => choose(target)} style={{ padding: 12, backgroundColor: '#5b481f', marginVertical: 4 }}>
      <Text style={{ color: '#fff' }}>{label}</Text></Pressable>;
  }
  return <View><Text>산지·상품 둘러보기</Text>
    {content ? <>
      {content.menu.map(item => action(item.label, item.target, item.id))}
      <Text>진행 중인 기획전</Text>
      {content.events.length === 0 ? <Text>현재 진행 중인 기획전이 없습니다.</Text> : content.events.map(event => <View key={event.id}>
        <Text>{event.title}</Text><Text>{event.description}</Text>
        {imageOrigin && event.heroImageId ? <Image accessibilityLabel={`${event.title} 대표 사진`} style={{ width: '100%', height: 180, resizeMode: 'contain' }}
          source={{ uri: `${imageOrigin}/catalog/products/${encodeURIComponent(event.heroProduct.productId)}/images/${encodeURIComponent(event.heroImageId)}` }} /> : null}
        {action(`기획전 ${event.title}`, { type: 'event', id: event.id })}
      </View>)}
      <Text>추천 상품</Text>
      {content.recommendations.length === 0 ? <Text>현재 등록된 추천 상품이 없습니다.</Text> : content.recommendations.map(item =>
        action(`추천 ${item.title}`, { type: 'product', id: item.productId }, item.productId))}
    </> : <Text>{busy ? '홈 정보를 불러오는 중입니다.' : '홈 정보를 불러오지 못했습니다. 다시 조회해 주세요.'}</Text>}
    <Text>상품 대분류</Text>
    {categories.filter(item => item.parentId === null).map(item => action(`홈 분류 ${item.name}`, { type: 'category', id: item.id }, item.id))}
    <Text>농가별 상품</Text>
    {sellers.map(item => action(`홈 농가 ${item.displayName}`, { type: 'seller', id: item.id }, item.id))}
    {action('전체 상품 둘러보기', { type: 'catalog' })}
  </View>;
}
