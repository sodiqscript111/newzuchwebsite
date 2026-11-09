import { z } from "zod"

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const ProductId = z.string().min(1).brand<"ProductId">()
export type ProductId = z.infer<typeof ProductId>

export const ProductImageId = z.string().min(1).brand<"ProductImageId">()
export type ProductImageId = z.infer<typeof ProductImageId>

export const CollectionSlug = slug.brand<"CollectionSlug">()
export type CollectionSlug = z.infer<typeof CollectionSlug>

export const ProductSlug = slug.brand<"ProductSlug">()
export type ProductSlug = z.infer<typeof ProductSlug>

export const Naira = z.int().min(0)
export type Naira = z.infer<typeof Naira>

export const Size = z.enum(["XS", "S", "M", "L", "XL", "XXL"])
export type Size = z.infer<typeof Size>

export const Collection = z.object({
  slug: CollectionSlug,
  name: z.string().min(1)
})
export type Collection = z.infer<typeof Collection>

export const ProductImage = z.object({
  id: ProductImageId,
  url: z.string()
})
export type ProductImage = z.infer<typeof ProductImage>

export const Product = z.object({
  id: ProductId,
  slug: ProductSlug,
  collectionSlug: CollectionSlug,
  name: z.string().min(1),
  price: Naira.nullable(),
  priceNote: z.string(),
  description: z.string(),
  sizes: z.array(Size),
  visible: z.boolean(),
  images: z.array(ProductImage)
})
export type Product = z.infer<typeof Product>

export const ProductInput = z.object({
  collectionSlug: CollectionSlug,
  name: z.string().trim().min(1, "Give the product a name").max(120),
  price: Naira.nullable(),
  priceNote: z.string().trim().max(120),
  description: z.string().trim().max(4000),
  sizes: z.array(Size),
  visible: z.boolean()
})
export type ProductInput = z.infer<typeof ProductInput>

export const CollectionInput = z.object({
  name: z.string().trim().min(1, "Give the collection a name").max(60)
})
