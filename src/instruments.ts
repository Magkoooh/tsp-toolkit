import * as cp from "node:child_process"
import { join } from "path"

import * as vscode from "vscode"
import {
    JSONRPC,
    JSONRPCClient,
    JSONRPCRequest,
    JSONRPCResponse,
} from "json-rpc-2.0"
import { plainToInstance } from "class-transformer"
import { DISCOVER_EXECUTABLE, EXECUTABLE } from "./kic-cli"
import {
    FriendlyNameMgr,
    IIDNInfo,
    InstrInfo,
    IoType,
    KicProcessMgr,
} from "./resourceManager"
import { LOG_DIR } from "./utility"
import { Log, SourceLocation } from "./logging"
//import { LoggerManager } from "./logging"

const DISCOVERY_TIMEOUT = 5

let nextID = 0
const createID = () => nextID++

const instr_map = new Map<string, string>()
instr_map.set("2601", "non_nimitz")
instr_map.set("2602", "non_nimitz")
instr_map.set("2611", "non_nimitz")
instr_map.set("2612", "non_nimitz")
instr_map.set("2635", "non_nimitz")
instr_map.set("2636", "non_nimitz")
instr_map.set("2601A", "non_nimitz")
instr_map.set("2602A", "non_nimitz")
instr_map.set("2611A", "non_nimitz")
instr_map.set("2612A", "non_nimitz")
instr_map.set("2635A", "non_nimitz")
instr_map.set("2636A", "non_nimitz")
instr_map.set("2651A", "non_nimitz")
instr_map.set("2657A", "non_nimitz")
instr_map.set("2601B", "non_nimitz")
instr_map.set("2601B-PULSE", "non_nimitz")
instr_map.set("2602B", "non_nimitz")
instr_map.set("2606B", "non_nimitz")
instr_map.set("2611B", "non_nimitz")
instr_map.set("2612B", "non_nimitz")
instr_map.set("2635B", "non_nimitz")
instr_map.set("2636B", "non_nimitz")
instr_map.set("2604B", "non_nimitz")
instr_map.set("2614B", "non_nimitz")
instr_map.set("2614B", "non_nimitz")
instr_map.set("2634B", "non_nimitz")
instr_map.set("2601B-L", "non_nimitz")
instr_map.set("2602B-L", "non_nimitz")
instr_map.set("2611B-L", "non_nimitz")
instr_map.set("2612B-L", "non_nimitz")
instr_map.set("2635B-L", "non_nimitz")
instr_map.set("2636B-L", "non_nimitz")
instr_map.set("2604B-L", "non_nimitz")
instr_map.set("2614B-L", "non_nimitz")
instr_map.set("2634B-L", "non_nimitz")
instr_map.set("3706-SNFP", "non_nimitz")
instr_map.set("3706-S", "non_nimitz")
instr_map.set("3706-NFP", "non_nimitz")
instr_map.set("3706A", "non_nimitz")
instr_map.set("3706A-SNFP", "non_nimitz")
instr_map.set("3706A-S", "non_nimitz")
instr_map.set("3706A-NFP", "non_nimitz")
instr_map.set("707B", "non_nimitz")
instr_map.set("708B", "non_nimitz")
instr_map.set("2450", "nimitz")
instr_map.set("2470", "nimitz")
instr_map.set("DMM7510", "nimitz")
instr_map.set("2460", "nimitz")
instr_map.set("2461", "nimitz")
instr_map.set("2461-SYS", "nimitz")
instr_map.set("DMM7512", "nimitz")
instr_map.set("DMM6500", "nimitz")
instr_map.set("DAQ6510", "nimitz")
instr_map.set("VERSATEST-300", "versatest")
instr_map.set("VERSATEST-600", "versatest")
instr_map.set("MP5103", "versatest")
instr_map.set("TSP", "versatest")

const rpcClient: JSONRPCClient = new JSONRPCClient(
    (jsonRPCRequest) =>
        fetch("http://localhost:3030/", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify(jsonRPCRequest),
        }).then((response) => {
            if (response.status === 200) {
                // Use client.receive when you received a JSON-RPC response.
                return response
                    .json()
                    .then((jsonRPCResponse) =>
                        rpcClient.receive(jsonRPCResponse as JSONRPCResponse),
                    )
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            } else if (jsonRPCRequest.id !== undefined) {
                return Promise.reject(new Error(response.statusText))
            }
        }),
    createID,
)

const jsonRPCRequest: JSONRPCRequest = {
    jsonrpc: JSONRPC,
    id: createID(),
    method: "get_instr_list",
}

/**
 * Each node in treeview is object of this class
 */
class InstrNode {
    #labelPrivate: string
    #expandablePrivate: boolean
    children: InstrNode[] = []
    constructor(name: string, expandable?: boolean) {
        this.#labelPrivate = name
        this.#expandablePrivate = expandable ?? false
    }
    public get label(): string {
        return this.#labelPrivate
    }
    // public get_Children(): InstrNode[] {
    //     return this.#childrenPrivate
    // }

    public updateLabelVal(label: string) {
        this.#labelPrivate = label
    }

    public get isExpandable(): boolean {
        return this.#expandablePrivate
    }
}

/**
 * Used to create Lan, Usb nodes for discovered instruments
 */
class IONode extends InstrNode {
    constructor(label: string, supported_type: IoType, isExpandable?: boolean) {
        super(label, isExpandable)
        this.supported_type = supported_type
    }

    private instrInList: string[] = []
    private supported_type: IoType = IoType.Lan
    private saved_list: string[] = []

    public IsSupported(type: IoType): boolean {
        return this.supported_type == type
    }

    public AddInstrument(instr: InstrInfo) {
        if (instr.io_type != this.supported_type) return
        let found = false
        const unique_id = DiscoveryHelper.createUniqueID(instr)
        //ToDo: extract to method
        for (let i = 0; i < this.saved_list.length; i++) {
            if (this.saved_list[i] == unique_id) {
                return
            }
        }

        this.instrInList.forEach((element) => {
            if (element == unique_id) {
                found = true
            }
        })

        //if found == true, extract the element and check if ip is same and modify
        if (found) {
            this.children.forEach((child) => {
                const res = child as IOInstrNode
                if (res.FetchUniqueID() == unique_id) {
                    res.updateConnectionAddress(instr)
                    return
                }
            })
        }

        if (!found) {
            this.instrInList.push(unique_id)
            this.children.push(new IOInstrNode(instr, false))
        }
    }

    public ClearAll() {
        this.instrInList.splice(0)
        this.children.splice(0)
    }

    /**
     * Used to clear discovered instruments if they are saved
     *
     * @param saved_list - list of current saved instruments
     */
    public ClearSavedDuplicateInstr(saved_list: string[]) {
        const idx_arr: number[] = []
        saved_list.forEach((saved_instr) => {
            const idx = this.instrInList.indexOf(saved_instr)
            if (idx > -1) {
                this.instrInList.splice(idx, 1)
            }

            for (let i = 0; i < this.children.length; i++) {
                const res = this.children[i] as IOInstrNode
                if (res.FetchUniqueID() == saved_instr) {
                    idx_arr.push(i)
                }
            }

            idx_arr.forEach((idx) => {
                this.children.splice(idx, 1)
            })
        })
    }

    public updateSavedList(saved_list: string[]) {
        this.saved_list = saved_list
    }
}

class LanNode extends IONode {
    constructor() {
        super("LAN", IoType.Lan, true)
    }
}

class USBNode extends IONode {
    constructor() {
        super("USB", IoType.Usb, true)
    }
}

class VisaNode extends IONode {
    constructor() {
        super("VISA", IoType.Visa, true)
    }
}

/**
 * Used to create Saved node
 */
class SavedNode extends InstrNode {
    constructor() {
        super("Saved", true)
    }
}

/**
 * Used to create sub-node for which right-click options are defined
 */
class IOInstrNode extends InstrNode {
    private _instrInfo: InstrInfo
    public showNestedMenu = true
    private _modSerial = ""
    private _saveStatus = false

    constructor(instr: InstrInfo, saveStat: boolean) {
        super(DiscoveryHelper.createModelSerial(instr))
        this._modSerial = instr.model + "#" + instr.serial_number
        this._saveStatus = saveStat

        this._instrInfo = instr
        this.addChildNodes()
    }

    public FetchInstrCateg(): string | undefined {
        return this._instrInfo.instr_categ
    }

    public FetchUniqueID(): string | undefined {
        return this._instrInfo.io_type.toString() + ":" + this._modSerial
    }

    public FetchConnectionAddr(): string {
        return this._instrInfo.instr_address
    }

    public FetchInstrIOType(): IoType {
        return this._instrInfo.io_type
    }

    public updateFriendlyName() {
        const connections: Array<InstrInfo> =
            vscode.workspace.getConfiguration("tsp").get("savedInstruments") ??
            []

        let friendly_name = ""
        const res_instr = connections.find(
            (x: InstrInfo) =>
                x.io_type == this._instrInfo.io_type &&
                x.model + "#" + x.serial_number == this._modSerial,
        )
        if (res_instr != undefined) {
            friendly_name = res_instr.friendly_name
        } else {
            //default friendly name
            friendly_name = this._modSerial
        }

        super.updateLabelVal(friendly_name)
    }

    public addDefaultFriendlyName() {
        this._instrInfo.friendly_name = DiscoveryHelper.createModelSerial(
            this._instrInfo,
        )
    }

    public fetchModelSerial(): string {
        return this._modSerial
    }

    public fetchSaveStatus(): boolean {
        return this._saveStatus
    }

    public fetchInstrInfo(): InstrInfo {
        return this._instrInfo
    }

    /**
     * Used to update connection address, _instrInfo object
     *
     * @param instrInfo - latest instrument details
     */
    public updateConnectionAddress(instrInfo: InstrInfo) {
        if (this._instrInfo.instr_address != instrInfo.instr_address) {
            //instrInfo also needs to be updated
            this._instrInfo = instrInfo
        }

        if (this._instrInfo.instr_address != this.children[0].label) {
            //instrument address needs to be updated
            this.children[0] = new InstrNode(this._instrInfo.instr_address)
        }
    }

    private addChildNodes() {
        //for loop with child nodes - remaining
        this.children.push(new InstrNode(this._instrInfo.instr_address))

        this.children.push(new InstrNode("Model: " + this._instrInfo.model))
        this.children.push(
            new InstrNode("Port: " + (this._instrInfo.socket_port ?? "NA")),
        )
        this.children.push(
            new InstrNode("Serial No: " + this._instrInfo.serial_number),
        )
    }
}

interface IRootNodeProvider {
    GetInstrumentNode(info: InstrInfo): InstrNode | undefined
}

class NodeProvider implements IRootNodeProvider {
    constructor(ioNode: IONode) {
        this.ioNode = ioNode
    }
    private ioNode: IONode | undefined
    GetInstrumentNode(instr: InstrInfo): IONode | undefined {
        if (!this.ioNode?.IsSupported(instr.io_type)) return undefined

        this.updateIONode(instr)
        if (this.ioNode?.children.length == 0) return undefined
        return this.ioNode
    }

    private updateIONode(instr: InstrInfo) {
        this.ioNode?.AddInstrument(instr)
    }

    /**
     * Used to update saved list to latest and clear discovered instruments
     * if the same are saved by the user
     *
     * @param saved_list - list of current saved instruments
     * @param do_clear - if discovered instruments need to be cleared or not
     */
    public updateSavedList(saved_list: string[], do_clear: boolean) {
        if (do_clear) {
            this.ioNode?.ClearSavedDuplicateInstr(saved_list)
        }
        this.ioNode?.updateSavedList(saved_list)
    }
}

class LanNodeProvider extends NodeProvider {
    constructor() {
        super(new LanNode())
    }
}

class USBNodeProvider extends NodeProvider {
    constructor() {
        super(new USBNode())
    }
}

class VisaNodeProvider extends NodeProvider {
    constructor() {
        super(new VisaNode())
    }
}

class SNodeprovider implements IRootNodeProvider {
    constructor(ioNode: SIONode) {
        this.ioNode = ioNode
    }
    private ioNode: SIONode | undefined
    GetInstrumentNode(instr: InstrInfo): SIONode | undefined {
        if (!this.ioNode?.IsSupported(instr.io_type)) return undefined

        this.updateIONode(instr)
        if (this.ioNode?.children.length == 0) return undefined
        return this.ioNode
    }

    private updateIONode(instr: InstrInfo) {
        this.ioNode?.AddInstrument(instr)
    }

    /**
     * Used to remove saved lan and usb child nodes
     *
     * @param instrID - unique ID of instrument to be removed
     */
    public removeInstrFromSavedNode(instrID: string) {
        this.ioNode?.innerRemInstrFromSavedNode(instrID)
    }
}

/**
 * Used to create Lan, Usb nodes for saved instruments
 */
class SIONode extends InstrNode {
    constructor(label: string, supported_type: IoType, isExpandable?: boolean) {
        super(label, isExpandable)
        this.supported_type = supported_type
    }

    private instrInList: string[] = []
    private supported_type: IoType = IoType.Lan

    public IsSupported(type: IoType): boolean {
        return this.supported_type == type
    }

    public AddInstrument(instr: InstrInfo) {
        if (instr.io_type != this.supported_type) return
        let found = false
        const unique_id = DiscoveryHelper.createUniqueID(instr)

        this.instrInList.forEach((element) => {
            if (element == unique_id) {
                found = true
            }
        })

        //if found == true, extract the element and check if ip is same and modify
        if (found) {
            this.children.forEach((child) => {
                const res = child as IOInstrNode
                if (res.FetchUniqueID() == unique_id) {
                    res.updateConnectionAddress(instr)
                    return
                }
            })
        }

        if (!found) {
            this.instrInList.push(unique_id)
            this.children.push(new IOInstrNode(instr, true))
        }

        this.children.forEach((child) => {
            const res = child as IOInstrNode
            if (res != undefined) {
                res.updateFriendlyName()
            }
        })
    }

    /**
     * Used to remove saved lan and usb child nodes
     *
     * @param instrID - unique ID of instrument to be removed
     */
    public innerRemInstrFromSavedNode(instrID: string) {
        const idx1 = this.instrInList.indexOf(instrID)
        if (idx1 > -1) {
            this.instrInList.splice(idx1, 1)
        }
        let idx2 = -1
        for (let i = 0; i < this.children.length; i++) {
            const res = this.children[i] as IOInstrNode
            if (res.FetchUniqueID() == instrID) {
                idx2 = i
                break
            }
        }

        if (idx2 > -1) {
            this.children.splice(idx2, 1)
        }
    }
}

class SLanNode extends SIONode {
    constructor() {
        super("LAN", IoType.Lan, true)
    }
}

class SUSBNode extends SIONode {
    constructor() {
        super("USB", IoType.Usb, true)
    }
}

class SVisaNode extends SIONode {
    constructor() {
        super("VISA", IoType.Visa, true)
    }
}

class SLanNodeProvider extends SNodeprovider {
    constructor() {
        super(new SLanNode())
    }
}

class SUsbNodeProvider extends SNodeprovider {
    constructor() {
        super(new SUSBNode())
    }
}

class SVisaNodeProvider extends SNodeprovider {
    constructor() {
        super(new SVisaNode())
    }
}

class SavedNodeProvider implements IRootNodeProvider {
    private node_providers: IRootNodeProvider[] = []
    private savedNode: SavedNode | undefined

    //saved_list - unique combination of iotype + ":" + model + "#" + serial_num
    private saved_list: string[] = []

    private _slanNodeProvider: SLanNodeProvider | undefined
    private _susbNodeProvider: SUsbNodeProvider | undefined
    private _svisaNodeProvider: SVisaNodeProvider | undefined

    constructor() {
        this._slanNodeProvider = new SLanNodeProvider()
        this._susbNodeProvider = new SUsbNodeProvider()
        this._svisaNodeProvider = new SVisaNodeProvider()
        this.node_providers.push(this._slanNodeProvider)
        this.node_providers.push(this._susbNodeProvider)
        this.node_providers.push(this._svisaNodeProvider)
    }

    GetInstrumentNode(instr: InstrInfo): InstrNode | undefined {
        if (this.savedNode == undefined) {
            this.savedNode = new SavedNode()
        }

        let isSaved = false
        this.saved_list.forEach((value) => {
            if (value.includes(DiscoveryHelper.createUniqueID(instr))) {
                isSaved = true
            }
        })
        if (isSaved) {
            const nodeItems = this.savedNode.children
            for (const node_provider of this.node_providers) {
                const ret = node_provider.GetInstrumentNode(instr)
                if (!nodeItems.includes(ret as InstrNode)) {
                    if (ret != undefined) {
                        nodeItems.push(ret)
                        break
                    }
                }
            }
            if (nodeItems.length > 0) {
                //to prevent empty usb, lan nodes addition
                const tempItems: InstrNode[] = []
                nodeItems.forEach((item) => {
                    if (item.children.length > 0) {
                        tempItems.push(item)
                    }
                })
                this.savedNode.children = tempItems
            }
            if (this.savedNode.children.length > 0) {
                return this.savedNode
            }
        }
        return undefined
    }

    public saveInstrToList(unique_id: string) {
        if (!this.saved_list.includes(unique_id)) {
            this.saved_list.push(unique_id)
        }
    }

    public getSavedInstrList(): string[] {
        return this.saved_list
    }

    public removeInstrFromList(unique_id: string) {
        const idx = this.saved_list.indexOf(unique_id)
        if (idx > -1) {
            this.saved_list.splice(idx, 1)
        }

        //from slan and susb
        if (unique_id.includes("Lan")) {
            this._slanNodeProvider?.removeInstrFromSavedNode(unique_id)
        } else if (unique_id.includes("Usb")) {
            this._susbNodeProvider?.removeInstrFromSavedNode(unique_id)
        } else if (unique_id.includes("Visa")) {
            this._svisaNodeProvider?.removeInstrFromSavedNode(unique_id)
        }
    }
}

export class NewTDPModel {
    //#region private variables
    private discovery_list: InstrInfo[] = []
    private connection_list: InstrInfo[] = []
    private node_providers: IRootNodeProvider[] = []
    private _savedNodeProvider: SavedNodeProvider | undefined
    private _lanNodeProvider: LanNodeProvider | undefined
    private _usbNodeProvider: USBNodeProvider | undefined
    private _visaNodeProvider: VisaNodeProvider | undefined
    private new_instr: InstrInfo | undefined

    public is_instr_discovered = false
    //#endregion

    //#region constructor
    constructor() {
        //move saveNodeprov to private var
        this._savedNodeProvider = new SavedNodeProvider()
        this._lanNodeProvider = new LanNodeProvider()
        this._usbNodeProvider = new USBNodeProvider()
        this._visaNodeProvider = new VisaNodeProvider()
        //this.node_providers.push(this._savedNodeProvider)
        this.node_providers.push(this._lanNodeProvider)
        this.node_providers.push(this._usbNodeProvider)
        this.node_providers.push(this._visaNodeProvider)

        this.fetchPersistedInstrList()
    }
    //#endregion

    //#region public methods

    public getContent(): Thenable<string> {
        return this.connect().then(() => {
            return new Promise(() => {
                rpcClient.requestAdvanced(jsonRPCRequest).then(
                    (jsonRPCResponse: JSONRPCResponse) => {
                        if (jsonRPCResponse.error) {
                            console.log(
                                `Received an error with code ${jsonRPCResponse.error.code} and message ${jsonRPCResponse.error.message}`,
                            )
                        } else {
                            this.parseDiscoveredInstruments(jsonRPCResponse)
                        }
                    },
                    () => {
                        console.log("RPC Instr List Fetch failed!")
                    },
                )
                //todo
            })
        })
    }

    public getChildren(node: InstrNode): InstrNode[] {
        return node.children
    }

    public roots(): Thenable<InstrNode[]> {
        // dynamic tree creation
        return this.connect().then(() => {
            return new Promise((c) => {
                const nodeItems: InstrNode[] = []
                if (
                    this.discovery_list.length < 0 &&
                    this.connection_list.length < 0
                ) {
                    return c(nodeItems)
                }

                // if any saved instrument is discovered and if the instrument address
                // has changed, we need to update it
                this.checkForSavedInstrIPChange()
                    .then(() => {})
                    .catch(() => {})

                this.connection_list.forEach((instr) => {
                    const ret =
                        this._savedNodeProvider?.GetInstrumentNode(instr)
                    if (ret != undefined) {
                        if (!nodeItems.includes(ret)) {
                            nodeItems.push(ret)
                        }
                    }
                })

                for (const node_provider of this.node_providers) {
                    this.discovery_list.forEach((instr) => {
                        const ret = node_provider.GetInstrumentNode(instr)
                        if (ret != undefined) {
                            if (!nodeItems.includes(ret)) {
                                nodeItems.push(ret)
                            }
                        }
                    })
                }

                return c(nodeItems)
            })
        })
    }

    //add from connect
    public async addFromConnectToSavedList(
        ioType: IoType,
        instr_details: InstrInfo,
    ) {
        const LOGLOC: SourceLocation = {
            file: "instruments.ts",
            func: `NewTDPModel.addFromConnectToSavedList("${ioType.toString()}", "${String(instr_details)}")`,
        }
        if (instr_details != undefined) {
            Log.trace("Adding instrument to list", LOGLOC)
            this._savedNodeProvider?.saveInstrToList(
                DiscoveryHelper.createUniqueID(instr_details),
            )
            this.addToConnectionList(instr_details)

            await this.saveInstrInfoToPersist(instr_details)

            const saved_list = this._savedNodeProvider?.getSavedInstrList()

            switch (ioType) {
                case IoType.Lan:
                    this._lanNodeProvider?.updateSavedList(
                        saved_list ?? [],
                        true,
                    )
                    break
                case IoType.Usb:
                    this._usbNodeProvider?.updateSavedList(
                        saved_list ?? [],
                        true,
                    )
                    break
                case IoType.Visa:
                    this._visaNodeProvider?.updateSavedList(
                        saved_list ?? [],
                        true,
                    )
                    break
            }
            return
        }
        Log.warn("Instrument details not provided", LOGLOC)
    }

    public async addSavedList(instr: unknown) {
        const nodeToBeSaved = instr as IOInstrNode
        if (nodeToBeSaved != undefined) {
            this._savedNodeProvider?.saveInstrToList(
                nodeToBeSaved.FetchUniqueID() ?? "",
            )

            nodeToBeSaved.addDefaultFriendlyName()
            this.addToConnectionList(nodeToBeSaved.fetchInstrInfo())
            const saved_list = this._savedNodeProvider?.getSavedInstrList()

            await this.saveInstrInfoToPersist(nodeToBeSaved.fetchInstrInfo())

            switch (nodeToBeSaved.FetchInstrIOType()) {
                case IoType.Lan:
                    this._lanNodeProvider?.updateSavedList(
                        saved_list ?? [],
                        true,
                    )
                    break
                case IoType.Usb:
                    this._usbNodeProvider?.updateSavedList(
                        saved_list ?? [],
                        true,
                    )
                    break
                case IoType.Visa:
                    this._visaNodeProvider?.updateSavedList(
                        saved_list ?? [],
                        true,
                    )
                    break
            }
        }
    }

    //check for redundant entries
    public addToConnectionList(instr: InstrInfo) {
        let idx = -1
        let status = "add_new"
        if (this.connection_list.length == 0) {
            this.connection_list.push(instr)
            return
        } else {
            for (let i = 0; i < this.connection_list.length; i++) {
                if (
                    DiscoveryHelper.createUniqueID(instr) ==
                    DiscoveryHelper.createUniqueID(this.connection_list[i])
                ) {
                    if (
                        this.connection_list[i].instr_address !=
                        instr.instr_address
                    ) {
                        idx = i
                        status = "update"
                        break
                    } else {
                        status = "no_change"
                        break
                    }
                }
            }
        }

        if (status == "add_new") {
            this.connection_list.push(instr)
        } else if (status == "update") {
            this.connection_list[idx] = instr
        }
    }

    public removeSavedList(instr: unknown) {
        const nodeToBeRemoved = instr as IOInstrNode
        if (nodeToBeRemoved != undefined) {
            let idx = -1
            for (let i = 0; i < this.connection_list.length; i++) {
                const uid = DiscoveryHelper.createUniqueID(
                    this.connection_list[i],
                )
                if (uid == nodeToBeRemoved.FetchUniqueID()) {
                    idx = i
                    break
                }
            }

            if (idx > -1) {
                this.connection_list.splice(idx, 1)
            }

            this._savedNodeProvider?.removeInstrFromList(
                nodeToBeRemoved.FetchUniqueID() ?? "",
            )

            const saved_list = this._savedNodeProvider?.getSavedInstrList()

            this.removeInstrFromPersistedList(nodeToBeRemoved.fetchInstrInfo())
            switch (nodeToBeRemoved.FetchInstrIOType()) {
                case IoType.Lan:
                    this._lanNodeProvider?.updateSavedList(
                        saved_list ?? [],
                        false,
                    )
                    break
                case IoType.Usb:
                    this._usbNodeProvider?.updateSavedList(
                        saved_list ?? [],
                        false,
                    )
                    break
                case IoType.Visa:
                    this._visaNodeProvider?.updateSavedList(
                        saved_list ?? [],
                        false,
                    )
                    break
            }
        }
    }
    //#endregion

    //#region private methods
    private connect(): Thenable<undefined> {
        return new Promise((c) => {
            c(void 0)
        })
    }

    private fetchPersistedInstrList() {
        const temp_list: InstrInfo[] =
            vscode.workspace.getConfiguration("tsp").get("savedInstruments") ??
            []

        this.connection_list = temp_list

        // const __info: InstrInfo = {
        //     io_type: IoType.Lan,
        //     instr_address: "192.168.0.1",
        //     socket_port: "NA",
        //     manufacturer: "KEITHLEY INSTRUMENTS LLC",
        //     model: "VERSATEST-600",
        //     serial_number: "TM-PQ2-23",
        //     firmware_revision: "0.0.1",
        //     instr_categ: "versatest",
        //     friendly_name: "VERSATEST-600#TM-PQ2-23",
        // }

        //this.connection_list.push(__info)

        this.connection_list.forEach((item: InstrInfo) => {
            this._savedNodeProvider?.saveInstrToList(
                DiscoveryHelper.createUniqueID(item),
            )
        })

        this.node_providers.forEach((disc_node_provider) => {
            const res_node = disc_node_provider as NodeProvider
            res_node.updateSavedList(
                this._savedNodeProvider?.getSavedInstrList() ?? [],
                false,
            )
        })
    }

    /**
     * Used to update saved instrument details if it is discovered with a
     * different instrument address
     */
    private async checkForSavedInstrIPChange() {
        for (let i = 0; i < this.discovery_list.length; i++) {
            for (let j = 0; j < this.connection_list.length; j++) {
                if (
                    DiscoveryHelper.createUniqueID(this.discovery_list[i]) ==
                        DiscoveryHelper.createUniqueID(
                            this.connection_list[j],
                        ) &&
                    this.discovery_list[i].instr_address !=
                        this.connection_list[j].instr_address
                ) {
                    this.connection_list[j].instr_address =
                        this.discovery_list[i].instr_address

                    //also update persisted list in settings.json
                    await this.saveInstrInfoToPersist(this.connection_list[j])
                    break
                }
            }
        }
    }

    /**
     * Used to remove saved instrument stored in settings.json file when user
     * tries to remove it using right-click option
     *
     * @param instr - saved instrument that needs to be removed from settings.json file
     */
    private removeInstrFromPersistedList(instr: InstrInfo) {
        try {
            const instrList: Array<InstrInfo> =
                vscode.workspace
                    .getConfiguration("tsp")
                    .get("savedInstruments") ?? []
            const config = vscode.workspace.getConfiguration("tsp")

            let idx = -1

            for (let i = 0; i < instrList.length; i++) {
                if (
                    instrList[i].io_type == instr.io_type &&
                    instrList[i].model == instr.model &&
                    instrList[i].serial_number == instr.serial_number
                ) {
                    idx = i
                    break
                }
            }

            if (idx > -1) {
                instrList.splice(idx, 1)

                void config.update(
                    "savedInstruments",
                    instrList,
                    vscode.ConfigurationTarget.Global,
                )
            }
        } catch (err_msg) {
            void vscode.window.showErrorMessage(String(err_msg))
            return
        }
    }

    /**
     * Used to persist saved instrument when extension is restarted
     *
     * @param instr - saved instrument that needs to stored and recalled
     */
    private async saveInstrInfoToPersist(instr: InstrInfo) {
        try {
            const instrList: Array<InstrInfo> =
                vscode.workspace
                    .getConfiguration("tsp")
                    .get("savedInstruments") ?? []
            const config = vscode.workspace.getConfiguration("tsp")

            const idx = instrList.findIndex((item) => {
                return (
                    item.io_type == instr.io_type &&
                    item.model == instr.model &&
                    item.serial_number == instr.serial_number
                )
            })

            if (idx == -1) {
                instrList.push(instr)

                await config.update(
                    "savedInstruments",
                    instrList,
                    vscode.ConfigurationTarget.Global,
                )
            } else {
                //found, check if connection address has changed
                //update
                let doUpdate = false
                if (instrList[idx].instr_address != instr.instr_address) {
                    instrList[idx].instr_address = instr.instr_address
                    doUpdate = true
                }
                if (instrList[idx].friendly_name != instr.friendly_name) {
                    instrList[idx].friendly_name = instr.friendly_name
                    doUpdate = true
                }
                if (doUpdate) {
                    await config.update(
                        "savedInstruments",
                        instrList,
                        vscode.ConfigurationTarget.Global,
                    )
                }
            }
            vscode.workspace.getConfiguration("tsp").get("savedInstruments")
        } catch (err_msg) {
            void vscode.window.showErrorMessage(String(err_msg))
            return
        }
    }

    /**
     * Used to parse the discovered instrument details and create a list for the same
     *
     * @param jsonRPCResponse - json rpc response whose result needs to be parsed
     * to extract the discovered instrument details
     */
    private parseDiscoveredInstruments(jsonRPCResponse: JSONRPCResponse) {
        const res: unknown = jsonRPCResponse.result
        if (typeof res === "string") {
            console.log("JSON RPC Instr list: " + res)
            const instrList = res.split("\n")

            //need to remove the last newline element??
            instrList?.forEach((instr) => {
                if (instr.length > 0) {
                    const obj = plainToInstance(InstrInfo, JSON.parse(instr))
                    //console.log(obj.fetch_uid())

                    if (this.discovery_list.length == 0) {
                        this.discovery_list.push(obj)
                        this.is_instr_discovered = true
                    } else {
                        let idx = -1
                        this.new_instr = undefined

                        for (let i = 0; i < this.discovery_list.length; i++) {
                            this.new_instr = undefined
                            if (
                                DiscoveryHelper.createUniqueID(
                                    this.discovery_list[i],
                                ) == DiscoveryHelper.createUniqueID(obj)
                            ) {
                                if (
                                    this.discovery_list[i].instr_address !=
                                    obj.instr_address
                                ) {
                                    idx = i
                                    this.new_instr = obj
                                    break
                                } else {
                                    break
                                }
                            } else {
                                this.new_instr = obj
                            }
                        }

                        if (this.new_instr != undefined) {
                            if (idx > -1) {
                                this.discovery_list[idx] = this.new_instr
                            } else {
                                this.discovery_list.push(this.new_instr)
                            }
                            this.is_instr_discovered = true
                        }
                    }
                }
            })
        }
    }
    //#endregion
}

type newTDP = vscode.TreeDataProvider<InstrNode>

export class InstrTDP implements newTDP {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private _onDidChangeTreeData: vscode.EventEmitter<any> =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new vscode.EventEmitter<any>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly onDidChangeTreeData: vscode.Event<any> =
        this._onDidChangeTreeData.event

    private instrModel: NewTDPModel | undefined
    constructor(model: NewTDPModel) {
        this.instrModel = model
    }
    getTreeItem(
        element: InstrNode,
    ): vscode.TreeItem | Thenable<vscode.TreeItem> {
        let expandableState = vscode.TreeItemCollapsibleState.None

        //Created TSP-481 to focus the newly connected instrument info in "Instruments" pane
        if (element.children.length > 0) {
            if (element.isExpandable) {
                expandableState = vscode.TreeItemCollapsibleState.Expanded
            } else {
                expandableState = vscode.TreeItemCollapsibleState.Collapsed
            }
        } else {
            expandableState = vscode.TreeItemCollapsibleState.None
        }

        const treeItem = new vscode.TreeItem(element.label, expandableState)

        if (element.children.length > 0) {
            const main_node = element as IOInstrNode
            //ToDo: showNestedMenu used to identify IOInstrNode
            if (main_node != undefined && main_node.showNestedMenu) {
                let cv = ""
                if (main_node.fetchSaveStatus() == false) {
                    cv = "NotSaved"
                } else {
                    cv = "ToRemove"
                }

                const categ = main_node.FetchInstrCateg()

                cv += categ?.includes("versatest")
                    ? "VersatestInstr"
                    : "RegInstr"

                treeItem.contextValue = cv
                return treeItem
            } else {
                return treeItem
            }
        } else {
            return treeItem
        }
    }

    getChildren(
        element?: InstrNode | undefined,
    ): vscode.ProviderResult<InstrNode[]> {
        return element
            ? this.instrModel?.getChildren(element)
            : this.instrModel?.roots()
    }

    public refresh(): void {
        if (this.instrModel != undefined) {
            void this.instrModel.getContent()
            if (this.instrModel.is_instr_discovered) {
                this.reloadTreeData()
                this.instrModel.is_instr_discovered = false
            }
        }
    }

    /**
     * Used to save the instrument from right-click menu option
     *
     * @param instr - instrument to be saved
     */
    public async saveInstrument(instr: unknown): Promise<void> {
        await this.instrModel?.addSavedList(instr)
        this.reloadTreeData()
    }

    /**
     * Used to save the instrument during connection
     *
     * @param instr_to_save - instrument to be saved
     * @param ioType - ioType can be lan, usb etc.
     * @param instr_details - additional info of instrument to be saved
     */
    public async saveInstrumentFromConnect(
        ioType: IoType,
        instr_details: InstrInfo,
    ): Promise<void> {
        const LOGLOC: SourceLocation = {
            file: "instruments.ts",
            func: `InstrTDP.saveInstrumentFromConnect("${ioType.toString()}", "${String(instr_details)}")`,
        }
        Log.trace("Add from connect to saved list", LOGLOC)
        await this.instrModel?.addFromConnectToSavedList(ioType, instr_details)
        this.reloadTreeData()
    }

    public removeInstrument(instr: unknown): void {
        this.instrModel?.removeSavedList(instr)
        this.reloadTreeData()
    }

    public reloadTreeData() {
        setTimeout(() => {
            this._onDidChangeTreeData.fire(undefined)
        }, 200)
    }
}

export class InstrumentsExplorer {
    private InstrumentsDiscoveryViewer: vscode.TreeView<InstrNode>
    private treeDataProvider?: InstrTDP
    private intervalID?: NodeJS.Timeout
    private _kicProcessMgr: KicProcessMgr

    constructor(
        context: vscode.ExtensionContext,
        kicProcessMgr: KicProcessMgr,
    ) {
        this._kicProcessMgr = kicProcessMgr
        const tdpModel = new NewTDPModel()
        const treeDataProvider = new InstrTDP(tdpModel)

        this.InstrumentsDiscoveryViewer =
            vscode.window.createTreeView<InstrNode>("InstrumentsExplorer", {
                treeDataProvider,
            })

        this.treeDataProvider = treeDataProvider
        vscode.commands.registerCommand("InstrumentsExplorer.refresh", () => {
            this.startDiscovery()
        })
        vscode.commands.registerCommand(
            "InstrumentsExplorer.openInstrumentsDiscoveryResource",
            () => void 0,
        )
        vscode.commands.registerCommand(
            "InstrumentsExplorer.revealResource",
            () => void 0,
        )

        const upgradefw = vscode.commands.registerCommand(
            "InstrumentsExplorer.upgradeFirmware",
            async (e) => {
                await this.upgradeFirmware(e)
            },
        )

        const upgradeMainframe = vscode.commands.registerCommand(
            "InstrumentsExplorer.upgradeMainframe",
            async (e) => {
                await this.upgradeMainframe(e)
            },
        )

        const upgradeSlot1 = vscode.commands.registerCommand(
            "InstrumentsExplorer.upgradeSlot1",
            async (e) => {
                await this.upgradeSlot1(e)
            },
        )

        const upgradeSlot2 = vscode.commands.registerCommand(
            "InstrumentsExplorer.upgradeSlot2",
            async (e) => {
                await this.upgradeSlot2(e)
            },
        )

        const upgradeSlot3 = vscode.commands.registerCommand(
            "InstrumentsExplorer.upgradeSlot3",
            async (e) => {
                await this.upgradeSlot3(e)
            },
        )

        const saveInstrument = vscode.commands.registerCommand(
            "InstrumentsExplorer.save",
            async (e) => {
                await this.saveInstrument(e)
            },
        )

        const removeInstrument = vscode.commands.registerCommand(
            "InstrumentsExplorer.remove",
            (e) => {
                this.removeInstrument(e)
            },
        )

        context.subscriptions.push(upgradefw)
        context.subscriptions.push(upgradeMainframe)
        context.subscriptions.push(upgradeSlot1)
        context.subscriptions.push(upgradeSlot2)
        context.subscriptions.push(upgradeSlot3)
        context.subscriptions.push(saveInstrument)
        context.subscriptions.push(removeInstrument)

        this.startDiscovery()
    }

    private startDiscovery() {
        if (this.InstrumentsDiscoveryViewer.message == "") {
            const discover = cp.spawn(
                DISCOVER_EXECUTABLE,
                [
                    "--log-file",
                    join(
                        LOG_DIR,
                        `${new Date()
                            .toISOString()
                            .substring(0, 10)}-kic-discover.log`,
                    ),
                    "all",
                    "--timeout",
                    DISCOVERY_TIMEOUT.toString(),
                    "--exit",
                ],
                //,
                // {
                //     detached: true,
                //     stdio: "ignore",
                // }
            )

            discover.on("exit", () => {
                this.InstrumentsDiscoveryViewer.message = ""
                clearInterval(this.intervalID)
            })

            //subprocess.unref()

            this.InstrumentsDiscoveryViewer.message =
                "Instruments Discovery in progress..."

            //this.treeDataProvider?.clear()

            this.intervalID = setInterval(() => {
                this.treeDataProvider?.refresh()
            }, 1000)
        }
    }

    public async rename(item: unknown) {
        //if (typeof item === typeof InstrDiscoveryNode) {
        const input_item = item as IOInstrNode
        const ip_str = await vscode.window.showInputBox({
            placeHolder: "Enter new friendly name",
        })
        if (
            ip_str !== null &&
            ip_str !== undefined &&
            ip_str.length > 0 &&
            input_item != undefined
        ) {
            await FriendlyNameMgr.checkandAddFriendlyName(
                input_item.fetchInstrInfo(),
                ip_str,
            )
            this.treeDataProvider?.reloadTreeData()
        }
    }

    public reset(item: unknown) {
        const kicTerminals = vscode.window.terminals.filter((t) => {
            const to = t.creationOptions as vscode.TerminalOptions
            return to?.shellPath?.toString() === EXECUTABLE
        })

        const inputNode = item as IOInstrNode

        if (kicTerminals.length == 0 && inputNode != undefined) {
            //reset using the "kic reset" command
            const connectionType = inputNode.FetchInstrIOType()
            console.log(
                "Connection address: " + inputNode.FetchConnectionAddr(),
            )

            let connection_type = "lan"
            if (connectionType == IoType.Visa) {
                connection_type = "visa"
            }

            //Start the connection process to reset
            //The process is expected to exit after sending the cli reset command
            cp.spawn(EXECUTABLE, [
                "--log-file",
                join(
                    LOG_DIR,
                    `${new Date().toISOString().substring(0, 10)}-kic.log`,
                ),
                "reset",
                connection_type,
                inputNode.FetchConnectionAddr(),
            ])
        } else {
            //Use the existing terminal to reset
            for (const kicCell of this._kicProcessMgr.kicList) {
                if (inputNode != undefined) {
                    if (inputNode.FetchConnectionAddr() == kicCell.connAddr) {
                        kicCell.sendTextToTerminal(".reset\n")
                    }
                }
            }
        }
    }

    public fetchConnectionArgs(
        item: object,
    ): [connection_str: string, model_serial?: string] {
        const resNode = item as IOInstrNode
        if (resNode != undefined) {
            const conn_name =
                resNode.label + "@" + resNode.FetchConnectionAddr()
            switch (resNode.FetchInstrIOType()) {
                case IoType.Lan:
                    return [conn_name]
                case IoType.Usb:
                    return [conn_name, resNode.fetchModelSerial()]
                case IoType.Visa:
                    return [conn_name, resNode.fetchModelSerial()]
            }
        }
        return [""]
    }

    private async upgradeFirmware(_e: unknown) {
        await this.genericUpgradeFW(_e, 0)
    }

    public async saveWhileConnect(
        ip: string,
        ioType: IoType,
        info: string,
        friendly_name: string,
        port: string | undefined,
    ) {
        const LOGLOC: SourceLocation = {
            file: "instruments.ts",
            func: `InstrumentExplorer.saveWhileConnect("${ip}", "${ioType.toString()}", "${info}", "${friendly_name}", "${port}")`,
        }
        const _info = <IIDNInfo>JSON.parse(info)
        const __info = new InstrInfo()
        __info.io_type = ioType
        __info.instr_address = ip
        __info.socket_port = port
        __info.manufacturer = _info.vendor
        __info.model = _info.model
        __info.serial_number = _info.serial_number
        __info.firmware_revision = _info.firmware_rev
        __info.friendly_name = friendly_name
        __info.instr_categ = ""

        const categ = instr_map.get(_info.model)
        if (categ != undefined) __info.instr_categ = categ

        Log.trace("Saving Instrument", LOGLOC)

        await this.treeDataProvider?.saveInstrumentFromConnect(ioType, __info)
    }

    private async saveInstrument(instr: unknown) {
        await this.treeDataProvider?.saveInstrument(instr)
    }

    //from connect

    private removeInstrument(instr: unknown) {
        this.treeDataProvider?.removeInstrument(instr)
    }

    private async upgradeMainframe(_e: unknown) {
        await this.genericUpgradeFW(_e, 0)
    }

    private async upgradeSlot1(_e: unknown) {
        await this.genericUpgradeFW(_e, 1)
    }

    private async upgradeSlot2(_e: unknown) {
        await this.genericUpgradeFW(_e, 2)
    }

    private async upgradeSlot3(_e: unknown) {
        await this.genericUpgradeFW(_e, 3)
    }

    /**
     * Common method to upgrade firmware/mainframe/slots
     * @param _e - tree item showing the menu
     * @param is_module - whether instrument contains a module or not
     * @param slot - the slot to upgrade if any
     */
    private async genericUpgradeFW(_e: unknown, slot = 0) {
        const kicTerminals = vscode.window.terminals.filter((t) => {
            const to = t.creationOptions as vscode.TerminalOptions
            return to?.shellPath?.toString() === EXECUTABLE
        })
        if (kicTerminals.length == 0) {
            void vscode.window.showInformationMessage(
                "Not connected to any instrument. Cannot proceed.",
            )
            return
        } else {
            const inputNode = _e as IOInstrNode

            for (const kicCell of this._kicProcessMgr.kicList) {
                if (inputNode != undefined) {
                    if (inputNode.FetchConnectionAddr() == kicCell.connAddr) {
                        const fw_file = await vscode.window.showOpenDialog({
                            filters: {
                                "All files (*.*)": ["*"],
                            },
                            canSelectFolders: false,
                            canSelectFiles: true,
                            canSelectMany: false,
                            openLabel: "Select firmware file to upgrade ...",
                        })

                        if (!fw_file || fw_file.length < 1) {
                            return
                        } else {
                            // .update "path" --slot {number}
                            kicCell.sendTextToTerminal(
                                `.upgrade "${fw_file[0].fsPath}" --slot ${slot}\n
                                `,
                            )
                        }
                        return
                    }
                }
            }
        }
    }
}

class DiscoveryHelper {
    public static createUniqueID(info: InstrInfo): string {
        let res = ""
        res = info.io_type.toString() + ":" + this.createModelSerial(info)
        return res
    }

    public static createModelSerial(info: InstrInfo): string {
        let res = ""
        res = info.model + "#" + info.serial_number
        return res
    }
}
