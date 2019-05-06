import { addProp } from "@pnp/odata";
import { _Web, Web } from "../webs/types";
import { ISiteGroups, SiteGroups } from "./types";
import { spPost } from "../operations";
import { escapeQueryStrValue } from "../utils/escapeSingleQuote";

declare module "../webs/types" {
    interface _Web {
        readonly siteGroups: ISiteGroups;
        readonly associatedOwnerGroup: ISiteGroups;
        readonly associatedMemberGroup: ISiteGroups;
        readonly associatedVisitorGroup: ISiteGroups;
        createDefaultAssociatedGroups(groupNameSeed: string, siteOwner: string, copyRoleAssignments?: boolean, clearSubscopes?: boolean, siteOwner2?: string): Promise<void>;
    }
    interface IWeb {

        /**
         * The site groups
         */
        readonly siteGroups: ISiteGroups;

        /**
         * The web's owner group
         */
        readonly associatedOwnerGroup: ISiteGroups;

        /**
         * The web's member group
         */
        readonly associatedMemberGroup: ISiteGroups;

        /**
         * The web's visitor group
         */
        readonly associatedVisitorGroup: ISiteGroups;

        /**
         * Creates the default associated groups (Members, Owners, Visitors) and gives them the default permissions on the site.
         * The target site must have unique permissions and no associated members / owners / visitors groups
         *
         * @param groupNameSeed The base group name. E.g. 'TestSite' would produce 'TestSite Members' etc.
         * @param siteOwner The user login name to be added to the site Owners group. Default is the current user
         * @param copyRoleAssignments Optional. If true the permissions are copied from the current parent scope
         * @param clearSubscopes Optional. true to make all child securable objects inherit role assignments from the current object
         * @param siteOwner2 Optional. The second user login name to be added to the site Owners group. Default is empty
         */
        createDefaultAssociatedGroups(groupNameSeed: string, siteOwner: string, copyRoleAssignments?: boolean, clearSubscopes?: boolean, siteOwner2?: string): Promise<void>;
    }
}

addProp(_Web, "siteGroups", SiteGroups);
addProp(_Web, "associatedOwnerGroup", SiteGroups, "associatedownergroup");
addProp(_Web, "associatedMemberGroup", SiteGroups, "associatedmembergroup");
addProp(_Web, "associatedVisitorGroup", SiteGroups, "associatedvisitorgroup");

_Web.prototype.createDefaultAssociatedGroups = async function (
    this: _Web,
    groupNameSeed: string,
    siteOwner: string,
    copyRoleAssignments = false,
    clearSubscopes = true,
    siteOwner2?: string): Promise<void> {

    await this.breakRoleInheritance(copyRoleAssignments, clearSubscopes);

    const q = this.clone(Web, "createDefaultAssociatedGroups(userLogin=@u,userLogin2=@v,groupNameSeed=@s)");
    q.query.set("@u", `'${escapeQueryStrValue(siteOwner || "")}'`);
    q.query.set("@v", `'${escapeQueryStrValue(siteOwner2 || "")}'`);
    q.query.set("@s", `'${escapeQueryStrValue(groupNameSeed || "")}'`);
    return spPost(q);
};

