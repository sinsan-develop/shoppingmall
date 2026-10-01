export type HomeTarget =
  | { type: 'home' | 'catalog' }
  | { type: 'category' | 'seller' | 'event' | 'product'; id: string };

export type HomeMenuItem = {
  id: string;
  label: string;
  displayOrder: number;
  visible: boolean;
  target: HomeTarget;
};

export type HomeEvent = {
  id: string;
  title: string;
  description: string;
  displayOrder: number;
  startAt: string;
  endAt: string;
  productIds: string[];
  heroProductId: string;
  heroImageId: string | null;
};

export type HomePayload = {
  menu: HomeMenuItem[];
  events: HomeEvent[];
  recommendations: string[];
};
