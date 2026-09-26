import { z } from 'zod';
import { isRichTextEmpty } from '@/lib/richText';
import type { CryptoCurrency } from '@/types/currency';

export const COLLECTIBLE_CURRENCIES = ['ETH', 'USDC', 'DG', 'G', 'UP'] as const satisfies readonly CryptoCurrency[];

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'A valid wallet address is required.');

export const collectibleFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120, 'Name must be 120 characters or fewer.'),
  description: z.string().max(12000, 'Description is too long.').optional().default(''),
  imageUrl: z.string().url('Upload a collectible image.'),
  chainId: z.number().int().positive('Choose a network.'),
  currency: z.enum(COLLECTIBLE_CURRENCIES),
  price: z.number().finite().positive('Price must be greater than zero.'),
  maxSupply: z.number().int().positive('Supply must be at least 1.'),
  maxKeysPerAddress: z.number().int().positive('Per-person limit must be at least 1.'),
  isClaimable: z.boolean().default(false),
  fulfillmentNote: z.string().max(6000, 'Fulfillment terms are too long.').optional().default(''),
}).superRefine((value, ctx) => {
  if (value.maxKeysPerAddress > value.maxSupply) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxKeysPerAddress'],
      message: 'Per-person limit cannot exceed the total supply.',
    });
  }
  if (value.isClaimable && isRichTextEmpty(value.fulfillmentNote)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fulfillmentNote'],
      message: 'Add fulfillment terms for the physical item.',
    });
  }
});

export const collectiblePublishSchema = collectibleFormSchema.and(z.object({
  creatorAddress: addressSchema,
  lockAddress: addressSchema,
  transactionHash: z.string().min(1),
}));

export type CollectibleFormValues = z.infer<typeof collectibleFormSchema>;
