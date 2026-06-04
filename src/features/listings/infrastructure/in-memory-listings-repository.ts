import type { CreateListingInput, ListingSummary } from '@/features/listings/domain/entities/listing';
import type { ListingsRepository } from '@/features/listings/domain/ports/listings-repository';

export class InMemoryListingsRepository implements ListingsRepository {
  private readonly byUser = new Map<string, ListingSummary[]>();
  private counter = 0;

  private of(userId: string): ListingSummary[] {
    let list = this.byUser.get(userId);
    if (!list) {
      list = [];
      this.byUser.set(userId, list);
    }
    return list;
  }

  async create(userId: string, input: CreateListingInput): Promise<string> {
    this.counter += 1;
    const id = `mine-${this.counter}`;
    this.of(userId).unshift({
      id,
      title: input.title,
      operation: input.operation,
      priceCents: input.priceCents,
      currency: input.currency,
      city: input.city,
      status: 'active',
    });
    return id;
  }

  async listMine(userId: string): Promise<ListingSummary[]> {
    return [...this.of(userId)];
  }
}
