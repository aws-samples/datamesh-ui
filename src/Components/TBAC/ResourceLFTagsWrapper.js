import { GetResourceLFTagsCommand, LakeFormationClient } from "@aws-sdk/client-lakeformation";
import { useEffect, useState } from "react";
import {Amplify, Auth } from "aws-amplify";
import ResourceTagContext from "./ResourceTagContext";

const config = Amplify.configure();

function ResourceLFTagsWrapper(props) {
    const [context, setContext] = useState(null);

    useEffect(async() => {
        const credentials = await Auth.currentCredentials();
        const lfClient = new LakeFormationClient({region: config.aws_project_region, credentials: Auth.essentialCredentials(credentials)});

        let payload = {
            Resource: {
                Table: {
                    DatabaseName: props.resourceDatabaseName,
                    Name: props.resourceName
                }
            }
        }

        setContext({
            resourceTag: await lfClient.send(new GetResourceLFTagsCommand(payload)),
            databaseName: props.resourceDatabaseName
        })
    }, []);

    return (
        <ResourceTagContext.Provider value={context}>
            {props.children}
        </ResourceTagContext.Provider>
    )
}

export default ResourceLFTagsWrapper;