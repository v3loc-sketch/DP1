// Loads a product's 3D model (Shopify "Model3d" media) via the Storefront API.
// Shopify converts an uploaded GLB and serves both a GLB and a USDZ source.
import { useEffect, useState } from 'react';

const STORE_DOMAIN = import.meta.env.VITE_SHOPIFY_STORE_DOMAIN as string | undefined; // e.g. my-shop.myshopify.com
const STOREFRONT_TOKEN = import.meta.env.VITE_SHOPIFY_STOREFRONT_TOKEN as string | undefined; // public Storefront API token
const API_VERSION = (import.meta.env.VITE_SHOPIFY_API_VERSION as string | undefined) || '2026-07';

const QUERY = /* GraphQL */ `
  query ProductModel3d($handle: String!) {
    product(handle: $handle) {
      id
      title
      media(first: 20) {
        nodes {
          mediaContentType
          alt
          previewImage { url width height }
          ... on Model3d {
            sources { url mimeType format filesize }
          }
        }
      }
    }
  }
`;

export type ProductModel = {
  glb?: string;
  usdz?: string;
  poster?: string;
  alt?: string;
};

type Source = { url: string; mimeType: string; format: string; filesize: number };
type MediaNode = {
  mediaContentType: string;
  alt?: string | null;
  previewImage?: { url: string } | null;
  sources?: Source[];
};

export async function fetchProductModel(handle: string, opts?: { domain?: string; token?: string }): Promise<ProductModel | null> {
  const domain = opts?.domain || STORE_DOMAIN;
  const token = opts?.token || STOREFRONT_TOKEN;
  if (!domain || !token) throw new Error('Set VITE_SHOPIFY_STORE_DOMAIN and VITE_SHOPIFY_STOREFRONT_TOKEN');
  const res = await fetch(`https://${domain}/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({ query: QUERY, variables: { handle } }),
  });
  if (!res.ok) throw new Error(`Storefront API ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  const nodes: MediaNode[] = json.data?.product?.media?.nodes ?? [];
  const model = nodes.find((n) => n.mediaContentType === 'MODEL_3D');
  if (!model?.sources) return null;
  const by = (fmt: string) => model.sources!.find((s) => s.format.toLowerCase() === fmt)?.url;
  return {
    glb: by('glb') ?? model.sources.find((s) => s.mimeType === 'model/gltf-binary')?.url,
    usdz: by('usdz') ?? model.sources.find((s) => s.mimeType === 'model/vnd.usdz+zip')?.url,
    poster: model.previewImage?.url,
    alt: model.alt ?? undefined,
  };
}

/** React hook: { model, loading, error } for a product handle. */
export function useProductModel(handle: string | undefined) {
  const [state, setState] = useState<{ model: ProductModel | null; loading: boolean; error?: string }>({ model: null, loading: !!handle });
  useEffect(() => {
    if (!handle) return;
    let alive = true;
    setState({ model: null, loading: true });
    fetchProductModel(handle)
      .then((model) => alive && setState({ model, loading: false }))
      .catch((e: Error) => alive && setState({ model: null, loading: false, error: e.message }));
    return () => {
      alive = false;
    };
  }, [handle]);
  return state;
}
