/**
 * Remote access protocol definitions
 * Defines message formats and types for Socket.IO communication
 */
// Event types for server->client communication
export var RemoteEvent;
(function (RemoteEvent) {
    // Terminal events
    RemoteEvent["TERMINAL_DATA"] = "terminal:data";
    RemoteEvent["TERMINAL_EXIT"] = "terminal:exit";
    // Claude events
    RemoteEvent["CLAUDE_OUTPUT"] = "claude:output";
    RemoteEvent["CLAUDE_ERROR"] = "claude:error";
    RemoteEvent["CLAUDE_EXIT"] = "claude:exit";
    RemoteEvent["CLAUDE_INSTANCES_UPDATED"] = "claude:instances:updated";
    RemoteEvent["CLAUDE_RESPONSE_COMPLETE"] = "claude:response:complete";
    // File events
    RemoteEvent["FILE_CHANGED"] = "file:changed";
    RemoteEvent["FILE_DELETED"] = "file:deleted";
    // System events
    RemoteEvent["CONNECTION_ERROR"] = "connection:error";
    RemoteEvent["SESSION_EXPIRED"] = "session:expired";
    RemoteEvent["SERVER_SHUTDOWN"] = "server:shutdown";
})(RemoteEvent || (RemoteEvent = {}));
// Permission levels
export var Permission;
(function (Permission) {
    Permission["FILE_READ"] = "file:read";
    Permission["FILE_WRITE"] = "file:write";
    Permission["FILE_DELETE"] = "file:delete";
    Permission["TERMINAL_CREATE"] = "terminal:create";
    Permission["TERMINAL_WRITE"] = "terminal:write";
    Permission["CLAUDE_SPAWN"] = "claude:spawn";
    Permission["CLAUDE_CONTROL"] = "claude:control";
    Permission["WORKSPACE_MANAGE"] = "workspace:manage";
    Permission["ADMIN"] = "admin";
})(Permission || (Permission = {}));
