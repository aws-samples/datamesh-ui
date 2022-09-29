import { Aws, CfnParameter, Stack } from "aws-cdk-lib";
import { Role } from "aws-cdk-lib/aws-iam";
import { StateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";
import { ApprovalWorkflow } from "./central/approval-workflow";
import { DataDomainManagement } from "./central/data-domain-management";
import { DataQualityCentralAccount } from "./central/data-quality-central-account";
import { DataMeshUI } from "./central/datamesh-ui";
import { DataMeshUIAPI } from "./central/datamesh-ui-api";
import { DataMeshUIAuth } from "./central/datamesh-ui-auth";
import { DataMeshUIAuthWorkflow } from "./central/datamesh-ui-auth-workflow";
import DataMeshUILFTagPermissions from "./central/datamesh-ui-lftag-permissions";
import { GlueCatalogSearchApi } from "./central/glue-catalog-search-api";
import { TbacSharingWorkflow } from "./central/tbac-sharing-workflow";
const tbacConfig = require(__dirname+"/../../src/tbac-config.json");

export class DataMeshUICentralStack extends Stack {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        const centralStateMachineArn = new CfnParameter(
            this,
            "centralStateMachineArn",
            {
                type: "String",
                description: "State Machine ARN in Central Governance account",
            }
        );

        const centralLfAdminRoleArn = new CfnParameter(
            this,
            "centralLfAdminRoleArn",
            {
                type: "String",
                description:
                    "LakeFormation Admin Role ARN in Central Governance account",
            }
        );

        const centralEventBusArn = new CfnParameter(
            this,
            "centralEventBusArn",
            {
                type: "String",
                description:
                    "Central EventBridge ARN in Central Governance account",
            }
        );

        const centralEventHash = new CfnParameter(
            this,
            "centralEventHash",
            {
                type: "String",
                description: "Event Hash to be displayed in the UI",
                default: "",
            }
        );

        const centralOpensearchSize = new CfnParameter(
            this,
            "centralOpensearchSize",
            {
                type: "String",
                description: "Instance size of OpenSearch node",
                default: "t3.small.search",
            }
        );

        // VPC CIDR ranges cannot be passed as CfnParameters (see https://github.com/aws/aws-cdk/issues/3617)
        const centralOpensearchVpcCidrRange =
            this.node.tryGetContext("centralOpensearchVpcCidrRange") ||
            "10.37.0.0/16";

        const dataMeshUIAuth = new DataMeshUIAuth(this, "DataMeshUIAuth");

        const dataMeshUIAPI = new DataMeshUIAPI(this, "DataMeshUIAPI", {
            httpiApiUserPoolAuthorizer: dataMeshUIAuth.httpApiUserPoolAuthorizer
        })

        const approvalWorkflow = new ApprovalWorkflow(
            this,
            "ApprovalWorkflow",
            {
                centralEventBusArn: centralEventBusArn.valueAsString,
                dpmStateMachineArn: centralStateMachineArn.valueAsString,
                dpmStateMachineRoleArn: centralLfAdminRoleArn.valueAsString,
            }
        );

        const searchCatalog = new GlueCatalogSearchApi(
            this,
            "SearchCatalogAPI",
            {
                accountId: Aws.ACCOUNT_ID,
                opensearchDataNodeInstanceSize:
                    centralOpensearchSize.valueAsString,
                userPool: dataMeshUIAuth.userPool,
                vpcCidrRange: centralOpensearchVpcCidrRange,
            }
        );

        const tbacSharingWorkflow = new TbacSharingWorkflow(this, "TbacSharingWorkflow", {
            cognitoAuthRole: dataMeshUIAuth.identityPool.authenticatedRole,
            approvalsTable: approvalWorkflow.approvalsTable,
            centralEventBusArn: centralEventBusArn.valueAsString
        });

        const dataDomainManagement = new DataDomainManagement(this, "DataDomainManagement", {
            centralWorkflowRole: Role.fromRoleArn(this, "CentralWorkflowRole", centralLfAdminRoleArn.valueAsString),
            uiAuthenticatedRole: dataMeshUIAuth.identityPool.authenticatedRole,
            httpApi: dataMeshUIAPI.httpApi,
            centralEventBusArn: centralEventBusArn.valueAsString,
            adjustGlueResourcePolicyFunction: tbacSharingWorkflow.adjustGlueResourcePolicyFunction,
            approvalsTable: approvalWorkflow.approvalsTable,
            confidentialityKey: tbacConfig.TagKeys.Confidentiality
        })

        const dataMeshUI = new DataMeshUI(this, "DataMeshUI", {
            stateMachineArn: approvalWorkflow.stateMachine.stateMachineArn,
            stateMachineName: approvalWorkflow.stateMachine.stateMachineName,
            dpmStateMachineArn: centralStateMachineArn.valueAsString,
            dpmStateMachineRoleArn: centralLfAdminRoleArn.valueAsString,
            searchApiUrl: searchCatalog.osEndpoint,
            userPool: dataMeshUIAuth.userPool,
            identityPool: dataMeshUIAuth.identityPool,
            tbacSharingWorkflow: tbacSharingWorkflow.tbacSharingWorkflow,
            httpApi: dataMeshUIAPI.httpApi,
            centralEventBusArn: centralEventBusArn.valueAsString,
            centralEventHash: centralEventHash.valueAsString
        });

        new DataMeshUILFTagPermissions(this, "LFTagPermissionManagement", {
            rolesToGrant: [
                dataMeshUIAuth.identityPool.authenticatedRole.roleArn
            ],
            httpApi: dataMeshUIAPI.httpApi
        })

        const registrationStateMachine = StateMachine.fromStateMachineArn(this, "RegistrationStateMachine", centralStateMachineArn.valueAsString)

        new DataMeshUIAuthWorkflow(this, "DataMeshUIAuthWorkflow", {
            registrationWorkflow: registrationStateMachine,
            nracApprovalWorkflow: approvalWorkflow.stateMachine,
            tbacApprovalWorkflow: tbacSharingWorkflow.tbacSharingWorkflow,
            httpApi: dataMeshUIAPI.httpApi,
            userMappingTable: dataDomainManagement.userDomainMappingTable,
            dataDomainLayer: dataDomainManagement.dataDomainLayer
        })
    }
}
