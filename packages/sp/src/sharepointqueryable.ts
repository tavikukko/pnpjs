import { combine, isUrlAbsolute, extend, jsS, IFetchOptions } from "@pnp/common";
import { Queryable, IQueryable, invokableFactory, IGetable } from "@pnp/odata";
import { Logger, LogLevel } from "@pnp/logging";
import { SPBatch } from "./batch";
import { metadata } from "./utils/metadata";
import { spGet, spPost } from "./operations";

export interface ISharePointQueryableConstructor<T = ISharePointQueryable> {
    new(baseUrl: string | ISharePointQueryable, path?: string): T;
}

export const spInvokableFactory = <T>(f: ISharePointQueryableConstructor<T>) => (baseUrl: string | ISharePointQueryable, path?: string): T => {
    return invokableFactory<T>(f)(baseUrl, path);
};

/**
 * SharePointQueryable Base Class
 *
 */
export class _SharePointQueryable<GetType = any> extends Queryable<GetType> implements ISharePointQueryable<GetType> {

    protected _forceCaching: boolean;

    /**
     * Creates a new instance of the SharePointQueryable class
     *
     * @constructor
     * @param baseUrl A string or SharePointQueryable that should form the base part of the url
     *
     */
    constructor(baseUrl: string | ISharePointQueryable, path?: string) {

        let url = "";
        let parentUrl = "";
        const query = new Map<string, string>();

        if (typeof baseUrl === "string") {
            // we need to do some extra parsing to get the parent url correct if we are
            // being created from just a string.

            if (isUrlAbsolute(baseUrl) || baseUrl.lastIndexOf("/") < 0) {
                parentUrl = baseUrl;
                url = combine(baseUrl, path);
            } else if (baseUrl.lastIndexOf("/") > baseUrl.lastIndexOf("(")) {
                // .../items(19)/fields
                const index = baseUrl.lastIndexOf("/");
                parentUrl = baseUrl.slice(0, index);
                path = combine(baseUrl.slice(index), path);
                url = combine(parentUrl, path);
            } else {
                // .../items(19)
                const index = baseUrl.lastIndexOf("(");
                parentUrl = baseUrl.slice(0, index);
                url = combine(baseUrl, path);
            }
        } else {

            parentUrl = baseUrl.toUrl();
            url = combine(parentUrl, path || "");
            const target = baseUrl.query.get("@target");
            if (target !== undefined) {
                query.set("@target", target);
            }
        }

        // init base with correct values for data seed
        super({
            parentUrl,
            query,
            url,
        });

        // post init actions
        if (typeof baseUrl !== "string") {
            this.configureFrom(baseUrl);
        }
        this._forceCaching = false;
    }

    /**
     * Gets the full url with query information
     *
     */
    public toUrlAndQuery(): string {

        const aliasedParams = new Map<string, string>(this.query);

        let url = this.toUrl().replace(/'!(@.*?)::(.*?)'/ig, (match, labelName, value) => {
            Logger.write(`Rewriting aliased parameter from match ${match} to label: ${labelName} value: ${value}`, LogLevel.Verbose);
            aliasedParams.set(labelName, `'${value}'`);
            return labelName;
        });

        if (aliasedParams.size > 0) {
            const char = url.indexOf("?") > -1 ? "&" : "?";
            url += `${char}${Array.from(aliasedParams).map((v: [string, string]) => v[0] + "=" + v[1]).join("&")}`;
        }

        return url;
    }

    /**
     * Choose which fields to return
     *
     * @param selects One or more fields to return
     */
    public select(...selects: string[]): this {
        if (selects.length > 0) {
            this.query.set("$select", selects.join(","));
        }
        return this;
    }

    public get<T = any>(options?: IFetchOptions): Promise<T> {
        return spGet<T>(<any>this, options);
    }

    /**
     * Expands fields such as lookups to get additional data
     *
     * @param expands The Fields for which to expand the values
     */
    public expand(...expands: string[]): this {
        if (expands.length > 0) {
            this.query.set("$expand", expands.join(","));
        }
        return this;
    }

    /**
     * Clones this SharePointQueryable into a new SharePointQueryable instance of T
     * @param factory Constructor used to create the new instance
     * @param additionalPath Any additional path to include in the clone
     * @param includeBatch If true this instance's batch will be added to the cloned instance
     */
    public clone<T extends ISharePointQueryable>(factory: (...args: any[]) => T, additionalPath?: string, includeBatch = true): T {

        const clone: T = super.cloneTo(factory(this, additionalPath), { includeBatch });

        // handle sp specific clone actions
        const t = "@target";
        if (this.query.has(t)) {
            clone.query.set(t, this.query.get(t));
        }

        return clone;
    }

    /**
     * The default action for this object (unless overridden spGet)
     * 
     * @param options optional request options
     */
    public defaultAction(options?: IFetchOptions): Promise<GetType> {
        return spGet(this, options);
    }

    /**
     * Gets a parent for this instance as specified
     *
     * @param factory The contructor for the class to create
     */
    protected getParent<T extends ISharePointQueryable>(
        factory: ISharePointQueryableConstructor<T>,
        baseUrl: string | ISharePointQueryable = this.parentUrl,
        path?: string,
        batch?: SPBatch): T {

        let parent = new factory(baseUrl, path).configureFrom(this);

        const t = "@target";
        if (this.query.has(t)) {
            parent.query.set(t, this.query.get(t));
        }
        if (batch !== undefined) {
            parent = parent.inBatch(batch);
        }
        return parent;
    }
}

export interface ISharePointQueryable<GetType = any> extends IGetable<GetType>, IQueryable<GetType> {
    select(...selects: string[]): this;
    expand(...expands: string[]): this;
    clone<T extends _SharePointQueryable>(factory: (...args: any[]) => T, additionalPath?: string, includeBatch?: boolean): T;
    get<T = GetType>(options?: IFetchOptions): Promise<T>;
}
export interface _SharePointQueryable extends IGetable { }
export const SharePointQueryable = spInvokableFactory<ISharePointQueryable>(_SharePointQueryable);

/**
 * Represents a REST collection which can be filtered, paged, and selected
 *
 */
export class _SharePointQueryableCollection<GetType = any[]> extends _SharePointQueryable<GetType> implements ISharePointQueryableCollection<GetType> {

    /**
     * Filters the returned collection (https://msdn.microsoft.com/en-us/library/office/fp142385.aspx#bk_supported)
     *
     * @param filter The string representing the filter query
     */
    public filter(filter: string): this {
        this.query.set("$filter", filter);
        return this;
    }

    /**
     * Orders based on the supplied fields
     *
     * @param orderby The name of the field on which to sort
     * @param ascending If false DESC is appended, otherwise ASC (default)
     */
    public orderBy(orderBy: string, ascending = true): this {
        const o = "$orderby";
        const query = this.query.has(o) ? this.query.get(o).split(",") : [];
        query.push(`${orderBy} ${ascending ? "asc" : "desc"}`);
        this.query.set(o, query.join(","));
        return this;
    }

    /**
     * Skips the specified number of items
     *
     * @param skip The number of items to skip
     */
    public skip(skip: number): this {
        this.query.set("$skip", skip.toString());
        return this;
    }

    /**
     * Limits the query to only return the specified number of items
     *
     * @param top The query row limit
     */
    public top(top: number): this {
        this.query.set("$top", top.toString());
        return this;
    }
}
export interface ISharePointQueryableCollection<GetType = any[]> extends IGetable<GetType>, ISharePointQueryable<GetType> {
    filter(filter: string): this;
    orderBy(orderBy: string, ascending?: boolean): this;
    skip(skip: number): this;
    top(top: number): this;
    get<T = GetType>(options?: IFetchOptions): Promise<T>;
}
export interface _SharePointQueryableCollection extends IGetable { }
export const SharePointQueryableCollection = spInvokableFactory<ISharePointQueryableCollection>(_SharePointQueryableCollection);

/**
 * Represents an instance that can be selected
 *
 */
export class _SharePointQueryableInstance<GetType = any> extends _SharePointQueryable<GetType> implements ISharePointQueryableInstance<GetType> {

    /**
     * Curries the update function into the common pieces
     * 
     * @param type 
     * @param mapper 
     */
    protected _update<Return, Props = any, Data = any>(type: string, mapper: (data: Data, props: Props) => Return): (props: Props) => Promise<Return> {
        return (props: any) => spPost(this, {
            body: jsS(extend(metadata(type), props)),
            headers: {
                "X-HTTP-Method": "MERGE",
            },
        }).then((d: Data) => mapper(d, props));
    }
}
export interface ISharePointQueryableInstance<GetType = any> extends IGetable, ISharePointQueryable<GetType> { }
export interface _SharePointQueryableInstance extends IGetable { }
export const SharePointQueryableInstance = spInvokableFactory<ISharePointQueryableInstance>(_SharePointQueryableInstance);
