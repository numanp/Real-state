import * as Linking from 'expo-linking';
import { Share } from 'react-native';

import type { PropertyDetail } from '@/features/properties/domain/entities/property-detail';
import { formatMoney } from '@/shared/ui/lib/format';

/**
 * Opens the native share sheet (WhatsApp etc. on mobile, navigator.share on
 * web) with a deep link to the property. The LATAM viral loop — house-hunting
 * is a group activity and WhatsApp is the social graph.
 */
export async function shareProperty(property: PropertyDetail): Promise<boolean> {
  const url = Linking.createURL(`/property/${property.id}`);
  const price = `${formatMoney(property.price.amountCents, property.price.currency)}${
    property.price.period === 'monthly' ? '/mes' : ''
  }`;
  const where = property.location.neighborhood ?? property.location.city;
  const message = `${property.title} — ${price} en ${where}. Mirala en Reel Estate 👇\n${url}`;

  try {
    const result = await Share.share({ message, url, title: property.title });
    return result.action === Share.sharedAction;
  } catch {
    return false;
  }
}
