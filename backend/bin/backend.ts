#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {DataMeshUIProducerStack} from '../lib/datamesh-ui-producer-stack';
import {DataMeshUICentralStack} from '../lib/datamesh-ui-central-stack';

const app = new cdk.App();
new DataMeshUIProducerStack(app, "DataMeshUIProducerStack");
new DataMeshUICentralStack(app, "DataMeshUICentralStack");