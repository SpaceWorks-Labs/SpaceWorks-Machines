import { BrandPageLoader } from "@/components/brand/BrandLoader";

// Below the space layout, never above it: a Suspense boundary above the layout streams a 200 before the
// layout's access check runs notFound(), so another space's dashboard would answer 200 instead of 404.
export default function Loading() {
  return <BrandPageLoader />;
}
