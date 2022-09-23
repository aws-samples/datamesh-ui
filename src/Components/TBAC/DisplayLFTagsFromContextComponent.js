import { useContext, useEffect, useState } from "react";
import DisplayLFTagsComponent from "./DisplayLFTagsComponent";
import ResourceTagContext from "./ResourceTagContext";

function DisplayLFTagsFromContextComponent(props) {
    const context = useContext(ResourceTagContext);
    const [tags, setTags] = useState([]);
    const [databaseName, setDatabaseName] = useState(null);
    const [refreshCounter, setRefreshCounter] = useState(1)

    useEffect(() => {
        if (context) {
            const resourceTag = context.resourceTag
            setDatabaseName(context.databaseName)
            if (props.resourceType == "table") {
                setTags(resourceTag.LFTagsOnTable);
            } else if (props.resourceType == "column") {
                const filtered = (resourceTag.LFTagsOnColumns && resourceTag.LFTagsOnColumns.length > 0) ? resourceTag.LFTagsOnColumns.filter(record => record.Name == props.resourceColumnName) : [];
                setTags(filtered && filtered.length >= 1 ? filtered[0].LFTags : []);
            }
        }
    }, [refreshCounter]);

    return (
        <DisplayLFTagsComponent lfTags={tags} database={databaseName} showDataDomain={props.showDataDomain} />
    )
}

export default DisplayLFTagsFromContextComponent;