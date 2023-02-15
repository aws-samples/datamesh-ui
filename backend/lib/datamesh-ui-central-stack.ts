import { Aws, CfnOutput, CfnParameter, Stack } from "aws-cdk-lib";
import { Role } from "aws-cdk-lib/aws-iam";
import { CfnDataLakeSettings } from "aws-cdk-lib/aws-lakeformation";
import { StateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";
import { ApprovalWorkflow } from "./central/approval-workflow";
import { DataDomainManagement } from "./central/data-domain-management";
import { DataQualityCentralAccount } from "./central/data-quality-central-account";
import { DataMeshUI } from "./central/datamesh-ui";
import { DataMeshUIAuth } from "./central/datamesh-ui-auth";
import { DataMeshUIAuthWorkflow } from "./central/datamesh-ui-auth-workflow";
import { DataMeshUIHosting } from "./central/datamesh-ui-hosting";
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

        const approvalWorkflow = new ApprovalWorkflow(
            this,
            "ApprovalWorkflow",
            {
                centralEventBusArn: centralEventBusArn.valueAsString,
                dpmStateMachineArn: centralStateMachineArn.valueAsString,
                dpmStateMachineRoleArn: centralLfAdminRoleArn.valueAsString,
                httpApi: dataMeshUIAuth.httpApi
            }
        );


        // const dataQuality = new DataQualityCentralAccount(
        //     this,
        //     "DataQualityCentralAccount",
        //     {
        //         userPool: dataMeshUIAuth.userPool,
        //     }
        // );

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
            centralEventBusArn: centralEventBusArn.valueAsString,
            approvalsLayer: approvalWorkflow.approvalsLayer,
            approvalsTable: approvalWorkflow.approvalsTable,
            productSharingMappingTable: approvalWorkflow.productShareMappingTable
        });

        const dataMeshUI = new DataMeshUI(this, "DataMeshUI", {
            stateMachineArn: approvalWorkflow.stateMachine.stateMachineArn,
            stateMachineName: approvalWorkflow.stateMachine.stateMachineName,
            dpmStateMachineArn: centralStateMachineArn.valueAsString,
            dpmStateMachineRoleArn: centralLfAdminRoleArn.valueAsString,
            searchApiUrl: searchCatalog.osEndpoint,
            userPool: dataMeshUIAuth.userPool,
            identityPool: dataMeshUIAuth.identityPool,
            tbacSharingWorkflow: tbacSharingWorkflow.tbacSharingWorkflow,
            workflowApiUrl: dataMeshUIAuth.httpApi.apiEndpoint,
            httpApi: dataMeshUIAuth.httpApi,
            centralEventBusArn: centralEventBusArn.valueAsString,
            centralEventHash: centralEventHash.valueAsString,
            productShareMappingTable: approvalWorkflow.productShareMappingTable
        });

        const uiLFTagPermissions = new DataMeshUILFTagPermissions(this, "LFTagPermissionManagement", {
            rolesToGrant: [
                dataMeshUIAuth.identityPool.authenticatedRole.roleArn
            ],
            httpApi: dataMeshUIAuth.httpApi
        })

        const dataDomainManagement = new DataDomainManagement(this, "DataDomainManagement", {
            centralWorkflowRole: Role.fromRoleArn(this, "CentralWorkflowRole", centralLfAdminRoleArn.valueAsString),
            uiAuthenticatedRole: dataMeshUIAuth.identityPool.authenticatedRole,
            httpApi: dataMeshUIAuth.httpApi,
            centralEventBusArn: centralEventBusArn.valueAsString,
            adjustGlueResourcePolicyFunction: tbacSharingWorkflow.adjustGlueResourcePolicyFunction,
            userDomainMappingTable: dataMeshUI.userDomainMappingTable,
            approvalsLayer: approvalWorkflow.approvalsLayer,
            approvalsTable: approvalWorkflow.approvalsTable,
            crDataDomainUIAccessRole: dataMeshUIAuth.crDataDomainUIAccessRole,
            confidentialityKey: tbacConfig.TagKeys.Confidentiality
        })

        const registrationStateMachine = StateMachine.fromStateMachineArn(this, "RegistrationStateMachine", centralStateMachineArn.valueAsString)

        new DataMeshUIAuthWorkflow(this, "DataMeshUIAuthWorkflow", {
            registrationWorkflow: registrationStateMachine,
            nracApprovalWorkflow: approvalWorkflow.stateMachine,
            tbacApprovalWorkflow: tbacSharingWorkflow.tbacSharingWorkflow,
            httpApi: dataMeshUIAuth.httpApi,
            userMappingTable: dataMeshUI.userDomainMappingTable
        })

        new DataMeshUIHosting(this, "DataMeshUIHosting")

        new CfnDataLakeSettings(this, "DataMeshUILFAdmins", {
            admins: [
                {
                    dataLakePrincipalIdentifier: centralLfAdminRoleArn.valueAsString
                },
                {
                    dataLakePrincipalIdentifier: dataDomainManagement.registerDataDomainRole.roleArn
                },
                {
                    dataLakePrincipalIdentifier: dataMeshUIAuth.crDataDomainUIAccessRole.roleArn
                },
                {
                    dataLakePrincipalIdentifier: uiLFTagPermissions.crDataMeshUITagAccessRole.roleArn
                },
                {
                    dataLakePrincipalIdentifier: searchCatalog.indexAllLambdaRole.roleArn
                },
                {
                    dataLakePrincipalIdentifier: searchCatalog.indexDeltaLambdaRole.roleArn
                },
                {
                    dataLakePrincipalIdentifier: tbacSharingWorkflow.lfTagGrantPermissionsRole.roleArn
                }
            ]
        })

        new CfnOutput(this, "LFAdminList", {
            value: JSON.stringify([
                centralLfAdminRoleArn.valueAsString,
                dataDomainManagement.registerDataDomainRole.roleArn,
                dataMeshUIAuth.crDataDomainUIAccessRole.roleArn,
                uiLFTagPermissions.crDataMeshUITagAccessRole.roleArn,
                searchCatalog.indexAllLambdaRole.roleArn,
                searchCatalog.indexDeltaLambdaRole.roleArn,
                tbacSharingWorkflow.lfTagGrantPermissionsRole.roleArn
            ])
        })
    }
}
