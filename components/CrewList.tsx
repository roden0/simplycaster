// Crew list component for managing team members

export interface CrewMember {
  id: string;
  name: string;
  email: string;
  role: "admin" | "host" | "guest";
  status: "active" | "pending" | "revoked";
  joinDate: string;
  lastActive?: string;
  invitedBy?: string;
  currentRoom?: {
    id: string;
    name: string;
  };
  guestToken?: {
    token: string;
    expiresAt: string;
    roomId: string;
  };
  permissions: {
    canCreateRooms: boolean;
    canManageRecordings: boolean;
    canInviteGuests: boolean;
    canManageUsers: boolean;
  };
}

export interface ActiveRoom {
  id: string;
  name: string;
  hostId: string;
  hostName: string;
  participantCount: number;
  createdAt: string;
}

export interface CrewListProps {
  crewMembers: CrewMember[];
  activeRooms: ActiveRoom[];
  searchQuery: string;
  sortBy: "name" | "email" | "role" | "joinDate";
  sortOrder: "asc" | "desc";
  currentPage: number;
  totalPages: number;
  onSearch: (query: string) => void;
  onSort: (sortBy: "name" | "email" | "role" | "joinDate", order: "asc" | "desc") => void;
  onPageChange: (page: number) => void;
  onInviteGuest: () => void;
  onCreateHost: () => void;
  onRevokeToken: (memberId: string) => void;
  onDeleteMember: (memberId: string) => void;
  currentUserId: string;
  isAdmin: boolean;
  isHost: boolean;
}

export function CrewList({
  crewMembers,
  activeRooms,
  searchQuery,
  sortBy,
  sortOrder,
  currentPage,
  totalPages,
  onSearch,
  onSort,
  onPageChange,
  onInviteGuest,
  onCreateHost,
  onRevokeToken,
  onDeleteMember,
  currentUserId,
  isAdmin,
  isHost,
}: CrewListProps) {
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTimeAgo = (dateString: string): string => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    return formatDate(dateString);
  };

  const canManageMember = (member: CrewMember): boolean => {
    if (!isAdmin && !isHost) return false;
    if (member.id === currentUserId) return false;
    
    // Admins can manage everyone except other admins
    if (isAdmin) return member.role !== "admin";
    
    // Hosts can only manage guests
    if (isHost) return member.role === "guest";
    
    return false;
  };

  const canRevokeToken = (member: CrewMember): boolean => {
    return (isAdmin || isHost) && 
           member.role === "guest" && 
           member.status === "active" && 
           member.guestToken;
  };

  const getRoleColor = (role: string): string => {
    switch (role) {
      case "admin": return "role-admin";
      case "host": return "role-host";
      case "guest": return "role-guest";
      default: return "role-guest";
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "active": return "status-active";
      case "pending": return "status-pending";
      case "revoked": return "status-revoked";
      default: return "status-pending";
    }
  };

  return (
    <div class="crew-container">
      {/* Crew Header */}
      <div class="crew-header">
        <div class="crew-title">
          <h1>Crew Management</h1>
          <p class="crew-subtitle">
            Manage team members, roles, and room access
          </p>
        </div>

        <div class="crew-actions">
          {(isAdmin || isHost) && (
            <>
              <button
                type="button"
                onClick={onInviteGuest}
                class="invite-guest-btn"
                aria-label="Invite guest to room"
              >
                👥 Invite Guest
              </button>
              
              {isAdmin && (
                <button
                  type="button"
                  onClick={onCreateHost}
                  class="create-host-btn"
                  aria-label="Create new host"
                >
                  ➕ Create Host
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Active Rooms Info */}
      {activeRooms.length > 0 && (
        <div class="active-rooms-section">
          <h3>Active Rooms</h3>
          <div class="active-rooms-list">
            {activeRooms.map((room) => (
              <div key={room.id} class="active-room-item">
                <div class="room-info">
                  <span class="room-name">{room.name}</span>
                  <span class="room-host">Host: {room.hostName}</span>
                  <span class="room-participants">
                    {room.participantCount} participants
                  </span>
                </div>
                <div class="room-time">
                  {getTimeAgo(room.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search and Controls */}
      <div class="crew-controls">
        <div class="search-container">
          <input
            type="text"
            placeholder="Search crew members..."
            value={searchQuery}
            onInput={(e) => onSearch((e.target as HTMLInputElement).value)}
            class="search-input"
            aria-label="Search crew members"
          />
          <span class="search-icon">🔍</span>
        </div>

        <div class="sort-controls">
          <label class="sort-label">Sort by:</label>
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = (e.target as HTMLSelectElement).value.split("-");
              onSort(field as "name" | "email" | "role" | "joinDate", order as "asc" | "desc");
            }}
            class="sort-select"
            aria-label="Sort crew members"
          >
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="email-asc">Email (A-Z)</option>
            <option value="email-desc">Email (Z-A)</option>
            <option value="role-asc">Role (A-Z)</option>
            <option value="role-desc">Role (Z-A)</option>
            <option value="joinDate-desc">Join Date (Newest)</option>
            <option value="joinDate-asc">Join Date (Oldest)</option>
          </select>
        </div>
      </div>

      {/* Crew Members List */}
      <div class="crew-members">
        {crewMembers.length === 0 ? (
          <div class="empty-state">
            <div class="empty-icon">👥</div>
            <h3>No crew members found</h3>
            <p>
              {searchQuery
                ? "Try adjusting your search terms"
                : "Start by inviting team members to join"}
            </p>
            {(isAdmin || isHost) && (
              <div class="empty-actions">
                <button
                  type="button"
                  onClick={onInviteGuest}
                  class="invite-guest-btn-secondary"
                >
                  Invite Guest
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={onCreateHost}
                    class="create-host-btn-secondary"
                  >
                    Create Host
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <div class="crew-table">
              <div class="table-header">
                <div class="header-cell name-col">Name</div>
                <div class="header-cell email-col">Email</div>
                <div class="header-cell role-col">Role</div>
                <div class="header-cell status-col">Status</div>
                <div class="header-cell activity-col">Last Active</div>
                <div class="header-cell actions-col">Actions</div>
              </div>

              {crewMembers.map((member) => (
                <div key={member.id} class="table-row">
                  <div class="table-cell name-col">
                    <div class="member-info">
                      <div class="member-name">
                        {member.name}
                        {member.id === currentUserId && (
                          <span class="you-badge">You</span>
                        )}
                      </div>
                      {member.currentRoom && (
                        <div class="current-room">
                          In room: {member.currentRoom.name}
                        </div>
                      )}
                    </div>
                  </div>

                  <div class="table-cell email-col">
                    <span class="member-email">{member.email}</span>
                  </div>

                  <div class="table-cell role-col">
                    <span class={`role-badge ${getRoleColor(member.role)}`}>
                      {member.role}
                    </span>
                  </div>

                  <div class="table-cell status-col">
                    <span class={`status-badge ${getStatusColor(member.status)}`}>
                      {member.status}
                    </span>
                    {member.guestToken && member.status === "active" && (
                      <div class="token-info">
                        Expires: {formatDate(member.guestToken.expiresAt)}
                      </div>
                    )}
                  </div>

                  <div class="table-cell activity-col">
                    <span class="last-active">
                      {member.lastActive ? getTimeAgo(member.lastActive) : "Never"}
                    </span>
                  </div>

                  <div class="table-cell actions-col">
                    <div class="member-actions">
                      {canRevokeToken(member) && (
                        <button
                          type="button"
                          onClick={() => onRevokeToken(member.id)}
                          class="revoke-btn"
                          aria-label={`Revoke access for ${member.name}`}
                        >
                          🚫 Revoke
                        </button>
                      )}
                      
                      {canManageMember(member) && (
                        <button
                          type="button"
                          onClick={() => onDeleteMember(member.id)}
                          class="delete-btn"
                          aria-label={`Remove ${member.name}`}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div class="pagination">
                <button
                  type="button"
                  onClick={() => onPageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  class="pagination-btn"
                  aria-label="Previous page"
                >
                  ← Previous
                </button>

                <div class="pagination-info">
                  <span>
                    Page {currentPage} of {totalPages}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onPageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  class="pagination-btn"
                  aria-label="Next page"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}