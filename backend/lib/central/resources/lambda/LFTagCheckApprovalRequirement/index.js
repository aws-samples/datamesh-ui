exports.handler = async(event) => {
    const row = event.lfTags.find((row) => row.TagKey == "confidentiality" && row.TagValues.includes("sensitive"))
    return  {"requires_approval": row !== undefined}
}