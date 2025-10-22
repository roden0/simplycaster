// Crew manager island for interactive crew functionality
import { signal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import { CrewList, type CrewMember, type ActiveRoom } from "../components/CrewList.tsx";
import { InviteGuestDialog, type InviteGuestFormData } from "../components/InviteGuestDialog.tsx";
import { CreateHostDialog, type CreateHostFormData } from "../components/CreateHostDialog.tsx";
import { ErrorDialog } from "../components/ErrorDialog.tsx";
import { getCopy } from "../lib/copy.ts";

export interface CrewManagerProps {
  currentUserId: string;
  isAdmin: boolean;
  isHost: boolean;
  initialCrewMembers?: CrewMember[];
  initialActiveRooms?: ActiveRoom[];
}

// Signals for crew state
const crewMembers = signal<CrewMember[]>([]);
const activeRooms = signal<ActiveRoom[]>([]);
const filteredCrewMembers = signal<CrewMember[]>([]);
const searchQuery = signal("");
const sortBy = signal<"name" | "email" | "role" | "joinDate">("name");
const sortOrder = signal<"asc" | "desc">("asc");
const currentPage = signal(1);
const isLoading = signal(false);
const error = signal<string | null>(null);

const ITEMS_PER_PAGE = 15;

export default function CrewManager({
  currentUserId,
  isAdmin,
  isHost,
  initialCrewMembers = [],
  initialActiveRooms = [],
}: CrewManagerProps) {
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showCreateHostDialog, setShowCreateHostDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Initialize crew members and active rooms
  useEffect(() => {
    crewMembers.value = initialCrewMembers;
    activeRooms.value = initialActiveRooms;
    applyFiltersAndSort();
  }, [initialCrewMembers, initialActiveRooms]);

  // Apply filters and sorting whenever dependencies change
  useEffect(() => {
    applyFiltersAndSort();
  }, [searchQuery.value, sortBy.value, sortOrder.value]);

  const applyFiltersAndSort = () => {
    let filtered = [...crewMembers.value];

    // Apply search filter
    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase();
      filtered = filtered.filter(
        (member) =>
          member.name.toLowerCase().includes(query) ||
          member.email.toLowerCase().includes(query) ||
          member.role.toLowerCase().includes(query) ||
          member.invitedBy?.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy.value) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "email":
          comparison = a.email.localeCompare(b.email);
          break;
        case "role":
          comparison = a.role.localeCompare(b.role);
          break;
        case "joinDate":
          comparison = new Date(a.joinDate).getTime() - new Date(b.joinDate).getTime();
          break;
      }

      return sortOrder.value === "desc" ? -comparison : comparison;
    });

    filteredCrewMembers.value = filtered;
    
    // Reset to first page if current page is out of bounds
    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    if (currentPage.value > totalPages && totalPages > 0) {
      currentPage.value = 1;
    }
  };

  const getPaginatedCrewMembers = (): CrewMember[] => {
    const startIndex = (currentPage.value - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredCrewMembers.value.slice(startIndex, endIndex);
  };

  const getTotalPages = (): number => {
    return Math.ceil(filteredCrewMembers.value.length / ITEMS_PER_PAGE);
  };

  const handleSearch = (query: string) => {
    searchQuery.value = query;
    currentPage.value = 1; // Reset to first page on search
  };

  const handleSort = (field: "name" | "email" | "role" | "joinDate", order: "asc" | "desc") => {
    sortBy.value = field;
    sortOrder.value = order;
    currentPage.value = 1; // Reset to first page on sort
  };

  const handlePageChange = (page: number) => {
    const totalPages = getTotalPages();
    if (page >= 1 && page <= totalPages) {
      currentPage.value = page;
    }
  };

  const handleInviteGuest = () => {
    setShowInviteDialog(true);
  };

  const handleInviteSubmit = async (formData: InviteGuestFormData) => {
    setIsInviting(true);
    error.value = null;

    try {
      // TODO: Implement actual API call to invite guest
      const response = await fetch("/api/crew/invite-guest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error(getCopy("errors.generic"));
      }

      const result = await response.json();
      
      console.log("Guest invitation sent successfully:", result);
      
      // Refresh crew members to show the new pending guest
      await loadCrewMembers();
      
      setShowInviteDialog(false);
    } catch (err) {
      console.error("Failed to invite guest:", err);
      error.value = getCopy("errors.generic");
    } finally {
      setIsInviting(false);
    }
  };

  const handleCreateHost = () => {
    setShowCreateHostDialog(true);
  };

  const handleCreateHostSubmit = async (formData: CreateHostFormData) => {
    setIsCreating(true);
    error.value = null;

    try {
      // TODO: Implement actual API call to create host
      const response = await fetch("/api/crew/create-host", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error(getCopy("errors.generic"));
      }

      const newHost = await response.json();
      
      // Add to local state
      crewMembers.value = [...crewMembers.value, newHost];
      
      console.log("Host created successfully:", newHost.id);
      
      setShowCreateHostDialog(false);
    } catch (err) {
      console.error("Failed to create host:", err);
      error.value = getCopy("errors.generic");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevokeToken = async (memberId: string) => {
    isLoading.value = true;
    error.value = null;

    try {
      // TODO: Implement actual API call to revoke guest token
      const response = await fetch(`/api/crew/${memberId}/revoke-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(getCopy("errors.generic"));
      }

      // Update local state
      crewMembers.value = crewMembers.value.map(member =>
        member.id === memberId
          ? { ...member, status: "revoked" as const, guestToken: undefined }
          : member
      );

      console.log("Guest access revoked successfully:", memberId);
    } catch (err) {
      console.error("Failed to revoke access:", err);
      error.value = getCopy("errors.generic");
    } finally {
      isLoading.value = false;
    }
  };

  const handleDeleteMember = (memberId: string) => {
    setMemberToDelete(memberId);
    setShowDeleteDialog(true);
  };

  const confirmDeleteMember = async () => {
    if (!memberToDelete) return;

    isLoading.value = true;
    error.value = null;

    try {
      // TODO: Implement actual API call to delete crew member
      const response = await fetch(`/api/crew/${memberToDelete}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(getCopy("errors.generic"));
      }

      // Remove from local state
      crewMembers.value = crewMembers.value.filter(
        (member) => member.id !== memberToDelete
      );

      console.log("Crew member removed successfully:", memberToDelete);
    } catch (err) {
      console.error("Failed to remove crew member:", err);
      error.value = getCopy("errors.generic");
    } finally {
      isLoading.value = false;
      setShowDeleteDialog(false);
      setMemberToDelete(null);
    }
  };

  const loadCrewMembers = async () => {
    isLoading.value = true;
    error.value = null;

    try {
      // TODO: Implement actual API call to fetch crew members
      const response = await fetch("/api/crew", {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(getCopy("errors.generic"));
      }

      const data = await response.json();
      crewMembers.value = data.members || [];
      activeRooms.value = data.activeRooms || [];
    } catch (err) {
      console.error("Failed to load crew members:", err);
      error.value = getCopy("errors.generic");
    } finally {
      isLoading.value = false;
    }
  };

  // Load crew members on mount if no initial data
  useEffect(() => {
    if (initialCrewMembers.length === 0) {
      loadCrewMembers();
    }
  }, []);

  return (
    <div class="crew-manager">
      <CrewList
        crewMembers={getPaginatedCrewMembers()}
        activeRooms={activeRooms.value}
        searchQuery={searchQuery.value}
        sortBy={sortBy.value}
        sortOrder={sortOrder.value}
        currentPage={currentPage.value}
        totalPages={getTotalPages()}
        onSearch={handleSearch}
        onSort={handleSort}
        onPageChange={handlePageChange}
        onInviteGuest={handleInviteGuest}
        onCreateHost={handleCreateHost}
        onRevokeToken={handleRevokeToken}
        onDeleteMember={handleDeleteMember}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        isHost={isHost}
      />

      {/* Invite Guest Dialog */}
      <InviteGuestDialog
        isOpen={showInviteDialog}
        activeRooms={activeRooms.value}
        onClose={() => setShowInviteDialog(false)}
        onInvite={handleInviteSubmit}
        isInviting={isInviting}
      />

      {/* Create Host Dialog */}
      <CreateHostDialog
        isOpen={showCreateHostDialog}
        onClose={() => setShowCreateHostDialog(false)}
        onCreate={handleCreateHostSubmit}
        isCreating={isCreating}
      />

      {/* Loading Overlay */}
      {isLoading.value && (
        <div class="loading-overlay">
          <div class="loading-content">
            <div class="loading-spinner"></div>
            <p>{getCopy("dialogs.processing")}</p>
          </div>
        </div>
      )}

      {/* Error Dialog */}
      <ErrorDialog
        isOpen={!!error.value}
        message={error.value || ""}
        onClose={() => error.value = null}
      />

      {/* Delete Confirmation Dialog */}
      <dialog
        class="delete-dialog"
        open={showDeleteDialog}
      >
        <div class="delete-content">
          <div class="delete-header">
            <h3>{getCopy("crew.deleteConfirm")}</h3>
          </div>
          <div class="delete-body">
            <p>
              {getCopy("crew.deleteMessage")}
            </p>
          </div>
          <div class="delete-actions">
            <button
              type="button"
              onClick={() => setShowDeleteDialog(false)}
              class="cancel-btn"
            >
              {getCopy("common.cancel")}
            </button>
            <button
              type="button"
              onClick={confirmDeleteMember}
              class="confirm-delete-btn"
              disabled={isLoading.value}
            >
              {isLoading.value ? getCopy("dialogs.removingMember") : getCopy("crew.remove")}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}