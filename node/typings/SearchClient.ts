import {
  IOResponse,
  AppClient,
  InstanceOptions,
  IOContext,
  RequestConfig,
  SegmentData,
  CacheType,
} from '@vtex/api'
import { stringify } from 'qs'

import { searchEncodeURI, SearchCrossSellingTypes } from '../resolvers/search/utils'

interface AutocompleteArgs {
  maxRows: number | string
  searchTerm: string
}

enum SimulationBehavior {
  SKIP = 'skip',
  DEFAULT = 'default'
}


const inflightKey = ({ baseURL, url, params, headers }: RequestConfig) => {
  return (
    baseURL! +
    url! +
    stringify(params, { arrayFormat: 'repeat', addQueryPrefix: true }) +
    `&segmentToken=${headers['x-vtex-segment']}`
  )
}

interface SearchPageTypeResponse {
  id: string
  pageType: string
  name: string
  url: string
  title: string | null
  metaTagDescription: string | null
}

export interface ISearch {
  pageType(path: string, query: string): Promise<SearchPageTypeResponse>
  product(slug: string): Promise<SearchProduct[]>
  productByEan(id: string): Promise<SearchProduct[]>
  productsByEan(ids: string[]): Promise<SearchProduct[]>
  productById(id: string): Promise<SearchProduct[]>
  productsById(ids: string[]): Promise<SearchProduct[]>
  productByReference(id: string): Promise<SearchProduct[]>
  productsByReference(ids: string[]): Promise<SearchProduct[]>
  productBySku(skuIds: string[]): Promise<SearchProduct[]>
  products(
    args: SearchArgs,
    useRaw: boolean
  ): Promise<IOResponse<SearchProduct[]>>
  productsQuantity(args: SearchArgs): Promise<number>
  brands(): Promise<Brand[]>
  brand(id: number): Promise<Brand[]>
  categories(treeLevel: number): Promise<CategoryTreeResponse[]>
  facets(facets: string): Promise<SearchFacets>
  category(id: string | number): Promise<CategoryByIdResponse>
  crossSelling(
    id: string,
    type: SearchCrossSellingTypes
  ): Promise<SearchProduct[]>
  autocomplete({
    maxRows,
    searchTerm,
  }: AutocompleteArgs): Promise<{ itemsReturned: SearchAutocompleteUnit[] }>
}

/** Search API
 * Docs: https://documenter.getpostman.com/view/845/catalogsystem-102/Hs44
 */
export class SearchClient extends AppClient implements ISearch {
  private searchEncodeURI: (x: string) => string

  public constructor(ctx: IOContext, opts?: InstanceOptions) {
    super('acupula.rich-relevance@0.x', ctx, opts)

    this.searchEncodeURI = searchEncodeURI(ctx.account)
  }

  public pageType = (path: string, query: string = '') => {
    const pageTypePath = path.startsWith('/') ? path.substr(1) : path

    const pageTypeQuery = !query || query.startsWith('?') ? query : `?${query}`

    return this.get<SearchPageTypeResponse>(
      `/pub/portal/pagetype/${pageTypePath}${pageTypeQuery}`,
      { metric: 'search-pagetype' }
    )
  }

  public product = (slug: string) =>
    this.get<SearchProduct[]>(
      `/pub/products/search/${this.searchEncodeURI(slug && slug.toLowerCase())}/p`,
      { metric: 'search-product' }
    )

  public productByEan = (id: string) =>
    this.get<SearchProduct[]>(
      `/pub/products/search?fq=alternateIds_Ean:${id}`,
      {
        metric: 'search-productByEan',
      }
    )

  public productsByEan = (ids: string[]) =>
    this.get<SearchProduct[]>(
      `/pub/products/search?${ids
        .map(id => `fq=alternateIds_Ean:${id}`)
        .join('&')}`,
      { metric: 'search-productByEan' }
    )

  public productById = (id: string, cacheable: boolean = true) => {
    const isVtex = this.context.platform === 'vtex'
    const url = isVtex ? '/pub/products/search?fq=productId:' : '/products/'
    return this.get<SearchProduct[]>(`${url}${id}`, {
      metric: 'search-productById',
      ...(cacheable ? {} : { cacheable: CacheType.None })
    })
  }

  public productsById = (ids: string[]) =>
    this.get<SearchProduct[]>(
      `/pub/products/search?${ids.map(id => `fq=productId:${id}`).join('&')}`,
      { metric: 'search-productById' }
    )

  public productByReference = (id: string) =>
    this.get<SearchProduct[]>(
      `/pub/products/search?fq=alternateIds_RefId:${id}`,
      {
        metric: 'search-productByReference',
      }
    )

  public productsByReference = (ids: string[]) =>
    this.get<SearchProduct[]>(
      `/pub/products/search?${ids
        .map(id => `fq=alternateIds_RefId:${id}`)
        .join('&')}`,
      { metric: 'search-productByReference' }
    )

  public productBySku = (skuIds: string[]) =>
    this.get<SearchProduct[]>(
      `/pub/products/search?${skuIds
        .map(skuId => `fq=skuId:${skuId}`)
        .join('&')}`,
      { metric: 'search-productBySku' }
    )

  public productsRaw = (args: SearchArgs) => {
    return this.getRaw<SearchProduct[]>(this.productSearchUrl(args), {
      metric: 'search-products',
    })
  }

  public products = (args: SearchArgs, useRaw = false) => {
    const method = useRaw ? this.getRaw : this.get
    return method<SearchProduct[]>(this.productSearchUrl(args), {
      metric: 'search-products',
    })
  }

  public productsQuantity = async (args: SearchArgs) => {
    const {
      headers: { resources },
    } = await this.getRaw(this.productSearchUrl(args))
    const quantity = resources.split('/')[1]
    return parseInt(quantity, 10)
  }

  public brands = () =>
    this.get<Brand[]>('/pub/brand/list', { metric: 'search-brands' })

  public brand = (id: number) =>
    this.get<Brand[]>(`/pub/brand/${id}`, { metric: 'search-brands' })

  public categories = (treeLevel: number) =>
    this.get<CategoryTreeResponse[]>(`/pub/category/tree/${treeLevel}/`, {
      metric: 'search-categories',
    })

  public getCategoryChildren = (id: number) =>
  this.get<Record<string, string>>(`/pub/category/categories/children?id=${id}`, {
    metric: 'search-category-children'
  })

  public facets = (facets: string = '') => {
    const [path, options] = decodeURI(facets).split('?')
    return this.get<SearchFacets>(
      `/pub/facets/search/${this.searchEncodeURI(encodeURI(
        `${path.trim()}${options ? '?' + options : ''}`
      ))}`,
      { metric: 'search-facets' }
    )
  }

  public category = (id: string | number) =>
    this.get<CategoryByIdResponse>(`/pub/category/${id}`, {
      metric: 'search-category',
    })

  public crossSelling = (id: string, type: SearchCrossSellingTypes) =>
    this.get<SearchProduct[]>(`/pub/products/crossselling/${type}/${id}`, {
      metric: 'search-crossSelling',
    })

  public autocomplete = ({ maxRows, searchTerm }: AutocompleteArgs) =>
    this.get<{ itemsReturned: SearchAutocompleteUnit[] }>(
      `/buscaautocomplete?maxRows=${maxRows}&productNameContains=${this.searchEncodeURI(
        encodeURIComponent(searchTerm)
      )}`,
      { metric: 'search-autocomplete' }
    )

  private get = <T = any>(url: string, config: RequestConfig = {}) => {
    const segmentData: SegmentData | undefined = (this
      .context! as CustomIOContext).segment
    const { channel: salesChannel = '' } = segmentData || {}

    config.params = {
      ...config.params,
      ...(!!salesChannel && { sc: salesChannel }),
    }
    config.inflightKey = inflightKey

    return this.http.get<T>(`/proxy/catalog${url}`, config)
  }

  public getField = (id: number) =>
    this.get<FieldResponseAPI>(
      `/pub/specification/fieldGet/${id}`,
      { metric: 'catalog-get-field-by-id' }
    )

  private getRaw = <T = any>(url: string, config: RequestConfig = {}) => {
    const segmentData: SegmentData | undefined = (this
      .context! as CustomIOContext).segment
    const { channel: salesChannel = '' } = segmentData || {}

    config.params = {
      ...config.params,
      ...(!!salesChannel && { sc: salesChannel }),
    }
    config.inflightKey = inflightKey

    return this.http.getRaw<T>(`/proxy/catalog${url}`, config)
  }

  private productSearchUrl = ({
    query = '',
    category = '',
    specificationFilters,
    priceRange = '',
    collection = '',
    salesChannel = '',
    orderBy = '',
    from = 0,
    to = 9,
    map = '',
    hideUnavailableItems = false,
    simulationBehavior = SimulationBehavior.DEFAULT,
  }: SearchArgs) => {
    const sanitizedQuery = this.searchEncodeURI(
      encodeURIComponent(
        decodeURIComponent(query || '').trim()
      )
    )
    if (hideUnavailableItems) {
      const segmentData = (this.context as CustomIOContext).segment
      salesChannel = (segmentData && segmentData.channel.toString()) || ''
    }
    let url = `/pub/products/search/${sanitizedQuery}?`
    if (category && !query) {
      url += `&fq=C:/${category}/`
    }
    if (specificationFilters && specificationFilters.length > 0) {
      url += specificationFilters.map(filter => `&fq=${filter}`)
    }
    if (priceRange) {
      url += `&fq=P:[${priceRange}]`
    }
    if (collection) {
      url += `&fq=productClusterIds:${collection}`
    }
    if (salesChannel) {
      url += `&fq=isAvailablePerSalesChannel_${salesChannel}:1`
    }
    if (orderBy) {
      url += `&O=${orderBy}`
    }
    if (map) {
      url += `&map=${map}`
    }
    if (from != null && from > -1) {
      url += `&_from=${from}`
    }
    if (to != null && to > -1) {
      url += `&_to=${to}`
    }
    if (simulationBehavior === SimulationBehavior.SKIP) {
      url += `&simulation=false`
    }
    return url
  }
}
