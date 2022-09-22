import { Box, StatusIndicator } from "@cloudscape-design/components";
import { Auth } from "aws-amplify";
import { useEffect, useState } from "react";
const cfnOutput = require("../cfn-output.json")
const axios = require("axios").default;


const STATE_PENDING = "pending"
const STATE_SUCCEEDED = "succeeded"
const STATE_FAILED = "failed"

function DataProductStateComponent(props) {
    const apiUrl = cfnOutput.InfraStack.WorkflowApiUrl + "/data-products/latest-state"
    const fullUrl = `${apiUrl}?dbName=${props.dbName}&tableName=${props.tableName}`
    const [prodState, setProdState] = useState(STATE_PENDING)
    const [prodError, setProdError] = useState(null)
    const [forceRefresh, setForceRefresh] = useState(1)

    useEffect(() => {
        async function run() {
            try {
                const session = await Auth.currentSession()
                const results = await axios({
                    method: "GET",
                    url: fullUrl,
                    headers: {
                        "Authorization": session.getAccessToken().getJwtToken(),
                        "Content-Type": "application/json"
                    }
                })
                
                setProdState(results.data.state)
                if (results.data.state == STATE_FAILED) {
                    setProdError(results.data.error)
                }

            } catch (e) {
                setProdState(STATE_PENDING)
            }
            
        }

        run()
    }, [forceRefresh])

    const renderState = () => {
        switch (prodState) {
            case STATE_PENDING:
                return (
                    <StatusIndicator type="pending">No State Data</StatusIndicator>
                )
            case STATE_SUCCEEDED:
                return (
                    <StatusIndicator type="success">Completed</StatusIndicator>
                )
            case STATE_FAILED:
                return (
                    <StatusIndicator type="error">{prodError}</StatusIndicator>
                )
            default:
                return (
                    <StatusIndicator type="in-progress">Running</StatusIndicator>
                )
            
        }
    }

    return (
        <Box>
            {renderState()}
        </Box>
    )
}

export default DataProductStateComponent;