import { useRef, useState, useSyncExternalStore } from "react";
import {
  Loader2,
  MoreHorizontal,
  Share2,
  UserMinus,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useTranslations } from "@/i18n";
import { api } from "@/api/client";
import type { CanvasPeer, CanvasSync } from "@/canvas/sync";
import { memberColor, memberName } from "@/canvas/members";
import { useToast } from "@/Components/common/ToastProvider";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/ui/avatar";
import { Button } from "@/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/ui/alert-dialog";

function MemberAvatar({ peer }: { peer: CanvasPeer }) {
  return (
    <Avatar aria-hidden="true">
      <AvatarFallback
        className={
          peer.role === "host"
            ? "bg-foreground text-background"
            : memberColor(peer).avatar
        }
      >
        {peer.role === "host" ? (
          <UserRound className="size-4" />
        ) : (
          <span className="text-xs font-medium">
            {peer.member_id.slice(0, 2).toUpperCase()}
          </span>
        )}
      </AvatarFallback>
    </Avatar>
  );
}

export function Collaborators({
  sync,
  enabled,
  canManage,
  onManageInvitation,
}: {
  sync: CanvasSync;
  enabled: boolean;
  canManage: boolean;
  onManageInvitation: () => void;
}) {
  const { t, locale } = useTranslations();
  const room = useSyncExternalStore(
    sync.subscribePresence,
    sync.getRoomMembers,
  );
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<CanvasPeer | null>(null);
  const [busy, setBusy] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const { showToast } = useToast();
  const guestCount = room.members.filter(
    (peer) => peer.role === "collaborator",
  ).length;
  const self = room.self?.member_id;

  async function removeMember() {
    if (!removing || busy) return;
    setBusy(true);
    try {
      await api(
        `/api/projects/${sync.project.id}/collaborators/${removing.member_id}`,
        { method: "DELETE" },
      );
      setRemoving(null);
      showToast({
        title: t("collaboration.memberRemoved", {
          name: memberName(removing, locale),
        }),
      });
    } catch (error) {
      showToast({
        title: t("collaboration.removeFailed"),
        description:
          error instanceof Error ? error.message : t("common.tryAgain"),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) return null;
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              ref={trigger}
              variant="ghost"
              size="sm"
              className="board-toolbar-members h-9 px-1.5"
              aria-label={t("collaboration.viewMembers", {
                count: room.members.length,
              })}
              title={t("collaboration.viewMembers", {
                count: room.members.length,
              })}
            />
          }
        >
          {room.members.length ? (
            <>
              <AvatarGroup className="board-toolbar-members-expanded">
                {room.members.slice(0, 3).map((peer) => (
                  <MemberAvatar key={peer.member_id} peer={peer} />
                ))}
                {room.members.length > 3 && (
                  <AvatarGroupCount className="text-xs tabular-nums">
                    +{room.members.length - 3}
                  </AvatarGroupCount>
                )}
              </AvatarGroup>
              <AvatarGroup className="board-toolbar-members-compact hidden">
                <MemberAvatar peer={room.members[0]} />
                {room.members.length > 1 && (
                  <AvatarGroupCount className="text-xs tabular-nums">
                    +{room.members.length - 1}
                  </AvatarGroupCount>
                )}
              </AvatarGroup>
            </>
          ) : (
            <UsersRound className="size-4" />
          )}
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={10}
          className="w-80 max-w-[calc(100vw-24px)] gap-0 p-0"
        >
          <PopoverHeader className="border-b px-4 py-3">
            <PopoverTitle>{t("collaboration.onlineMembers")}</PopoverTitle>
            <PopoverDescription className="text-xs">
              {t("collaboration.capacity", {
                count: guestCount,
                max: room.maxCollaborators,
              })}
            </PopoverDescription>
          </PopoverHeader>
          <ul className="max-h-[min(360px,55dvh)] overflow-y-auto overscroll-contain p-1.5">
            {room.members.map((peer) => (
              <li
                key={peer.member_id}
                className="flex min-h-14 items-center gap-3 rounded-md px-2.5 py-2 hover:bg-muted/50"
              >
                <MemberAvatar peer={peer} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {memberName(peer, locale)}
                    {peer.member_id === self && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        {t("collaboration.you")}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t(
                      peer.role === "host"
                        ? "collaboration.hostRole"
                        : "collaboration.editorRole",
                    )}
                  </p>
                </div>
                {canManage && peer.role === "collaborator" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("collaboration.memberActions", {
                            name: memberName(peer, locale),
                          })}
                        />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          setOpen(false);
                          setRemoving(peer);
                        }}
                      >
                        <UserMinus />
                        {t("collaboration.remove")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            ))}
            {!room.members.length && (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                {t("collaboration.connecting")}
              </li>
            )}
          </ul>
          {canManage && (
            <div className="border-t p-1.5">
              <Button
                variant="ghost"
                className="w-full justify-start"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  onManageInvitation();
                }}
              >
                <Share2 />
                {t("collaboration.manageInvitation")}
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      <AlertDialog
        open={!!removing}
        onOpenChange={(next) => {
          if (!next && !busy) setRemoving(null);
        }}
      >
        <AlertDialogContent initialFocus={cancel} finalFocus={trigger}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("collaboration.removeTitle", {
                name: removing ? memberName(removing, locale) : "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("collaboration.removeDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancel} disabled={busy}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void removeMember()}
            >
              {busy && <Loader2 className="animate-spin" />}
              {t("collaboration.remove")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
