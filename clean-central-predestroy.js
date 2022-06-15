#!/usr/bin/env node

const { EventBridgeClient, ListRulesCommand, DeleteRuleCommand, ListTargetsByRuleCommand, RemoveTargetsCommand } = require("@aws-sdk/client-eventbridge");
const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");
const {fromIni} = require("@aws-sdk/credential-provider-ini")
const util = require("util")

const main = async() => {
    const profile = process.argv[2];
    if (profile) {
        const stsClient = new STSClient({
            credentials: fromIni({profile: profile})
        });

        const identity = await stsClient.send(new GetCallerIdentityCommand())
        const accountId = identity.Account

        const ebClient = new EventBridgeClient({
            credentials: fromIni({profile: profile})
        })

        const eventBusName = util.format("%s_centralApprovalBus", accountId)

        let nextToken = null;

        do {
            let rules = await ebClient.send(new ListRulesCommand({EventBusName: eventBusName, NextToken: nextToken}))

            for (let rule of rules.Rules) {
                let targetsNextToken = null;
                let targetIds = [];

                do {
                    let targetsResponse = await ebClient.send(new ListTargetsByRuleCommand({EventBusName: eventBusName, Rule: rule.Name, NextToken: targetsNextToken}))
                    
                    for (let target of targetsResponse.Targets) {
                        targetIds.push(target.Id)
                    }

                    targetsNextToken = targetsResponse.NextToken
                } while(targetsNextToken != null)

                if (targetIds.length > 0) {
                    await ebClient.send(new RemoveTargetsCommand({Ids: targetIds, Rule: rule.Name, EventBusName: eventBusName}))
                }

                await ebClient.send(new DeleteRuleCommand({EventBusName: eventBusName, Name: rule.Name}))
            }

            nextToken = rules.NextToken;
        } while (nextToken != null);
        
    } else {
        console.error("Missing profile");
    }

}

main();