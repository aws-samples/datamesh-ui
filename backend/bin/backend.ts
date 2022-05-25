#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { DataMeshUIProducerStack } from "../lib/datamesh-ui-producer-stack";
import { DataMeshUICentralStack } from "../lib/datamesh-ui-central-stack";
import { Aspects } from "aws-cdk-lib";
import { AwsSolutionsChecks, NagSuppressions} from 'cdk-nag';

const app = new cdk.App();
const producerStack = new DataMeshUIProducerStack(app, "DataMeshUIProducerStack");
const centralStack = new DataMeshUICentralStack(app, "DataMeshUICentralStack");

NagSuppressions.addResourceSuppressions(centralStack, [
    {
        id: "AwsSolutions-IAM4",
        reason: "Foundational permissions"
    },
    {
        id: "AwsSolutions-L1",
        reason: "Not applicable"
    },
    {
        id: "AwsSolutions-IAM5",
        reason: "Not applicable. Permissions are centrally managed via Lake Formation"
    },
    {
        id: "AwsSolutions-SF1",
        reason: "Not applicable"
    },
    {
        id: "AwsSolutions-SF2",
        reason: "Not applicable"
    }
], true)

NagSuppressions.addResourceSuppressions(producerStack, [
    {
        id: "AwsSolutions-IAM4",
        reason: "Foundational permissions"
    }
], true)

Aspects.of(app).add(new AwsSolutionsChecks({verbose: true}))