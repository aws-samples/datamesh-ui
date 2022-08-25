exports.handler = async (event) => {
    const centralDbName = event.source.database;
    const exploded = centralDbName.split("data-domain-");
    return {
        "producer_acc_id": exploded[1],
    }
};
