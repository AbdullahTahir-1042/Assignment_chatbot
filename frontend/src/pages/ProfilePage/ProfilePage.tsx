import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageContainer } from "../../ui/PageContainer";
import { Card } from "../../ui/Card";
import { EmptyState } from "../../ui/EmptyState";
import { Spinner } from "../../ui/Spinner";
import { Button } from "../../ui/Button";
import { FormField } from "../../ui/FormField";
import { useAuthStore, useUpdateProfile, updateProfileSchema, type UpdateProfileInput } from "../../features/auth";
import { useAppointments, AppointmentItem } from "../../features/appointments";
import { ApiError } from "../../lib/http";
import { setDocumentTitle } from "../../lib/documentTitle";

/**
 * The signed-in user's own profile: identity card, booking totals, account
 * details (editable in place) and the five most recent appointments. Data
 * comes from the same queries the dashboard uses, so nothing here can drift
 * from the rest of the app.
 */
export const ProfilePage = () => {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { data, isPending } = useAppointments();

  const [isEditing, setIsEditing] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    setDocumentTitle();
  }, []);

  // "Saved" is a transient notice: show it, then let it fade after a moment.
  useEffect(() => {
    if (!showSaved) return;
    const timer = window.setTimeout(() => setShowSaved(false), 2500);
    return () => window.clearTimeout(timer);
  }, [showSaved]);

  const updateProfile = useUpdateProfile();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const appointments = useMemo(() => data?.pages.flatMap((p) => p.appointments) ?? [], [data]);

  const totals = useMemo(() => {
    let confirmed = 0;
    for (const appointment of appointments) {
      if (appointment.status !== "cancelled") confirmed += 1;
    }
    return { total: appointments.length, confirmed };
  }, [appointments]);

  const recent = useMemo(
    () => [...appointments].sort((a, b) => b.startsAt.localeCompare(a.startsAt)).slice(0, 5),
    [appointments],
  );

  if (!user) {
    return (
      <PageContainer size="default">
        <div className="flex justify-center py-16">
          <Spinner label="Loading profile" />
        </div>
      </PageContainer>
    );
  }

  const initial = user.name.trim().charAt(0).toUpperCase();

  const startEditing = () => {
    reset({ name: user.name, email: user.email });
    setIsEditing(true);
    setShowSaved(false);
  };

  const cancelEditing = () => {
    reset({ name: user.name, email: user.email });
    setIsEditing(false);
  };

  const onSave = (values: UpdateProfileInput) => {
    updateProfile.mutate(values, {
      onSuccess: ({ user: updated }) => {
        setUser(updated);
        setIsEditing(false);
        setShowSaved(true);
      },
      onError: (err) => {
        if (err instanceof ApiError) {
          const emailError = err.fieldError("email");
          if (emailError) setError("email", { type: "server", message: emailError });
        }
      },
    });
  };

  return (
    <PageContainer size="default">
      <div className="mb-6">
        <p className="text-sm font-medium text-indigo-600">Account</p>
        <h1 className="text-2xl font-semibold text-slate-900">Profile</h1>
      </div>

      <div className="space-y-6">
        <Card className="flex flex-wrap items-center gap-5 p-6">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-2xl font-semibold text-white shadow-md shadow-indigo-600/25">
            {initial}
          </span>
          <div className="min-w-0">
            <p className="text-xl font-semibold text-slate-900">{user.name}</p>
            <p className="text-sm text-slate-500">{user.email}</p>
            {user.createdAt && (
              <p className="mt-1 text-xs text-slate-400">Member since {formatMemberSince(user.createdAt)}</p>
            )}
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Total bookings" value={totals.total} />
          <StatCard label="Confirmed" value={totals.confirmed} />
        </div>

        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Account details</h2>
            {isEditing ? (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={cancelEditing}>
                  Cancel
                </Button>
                <Button size="sm" type="submit" form="profile-edit-form" isLoading={updateProfile.isPending}>
                  Save changes
                </Button>
              </div>
            ) : showSaved ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                <svg
                  aria-hidden
                  className="size-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                    clipRule="evenodd"
                  />
                </svg>
                Saved
              </span>
            ) : (
              <Button variant="ghost" size="sm" onClick={startEditing}>
                Edit
              </Button>
            )}
          </div>

          {isEditing ? (
            <form
              id="profile-edit-form"
              className="grid gap-x-6 gap-y-4 sm:grid-cols-2"
              noValidate
              onSubmit={handleSubmit(onSave)}
            >
              <FormField
                label="Name"
                autoComplete="name"
                error={errors.name?.message}
                {...register("name")}
              />
              <FormField
                label="Email"
                type="email"
                autoComplete="email"
                error={errors.email?.message}
                {...register("email")}
              />
              <p className="text-xs leading-relaxed text-slate-500 sm:col-span-2">
                Changing the email makes it your new sign-in for both this session and future logins.
              </p>
            </form>
          ) : (
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Detail label="Name" value={user.name} />
              <Detail label="Email" value={user.email} />
            </dl>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent appointments</h2>
          {isPending ? (
            <div className="flex justify-center py-8">
              <Spinner label="Loading appointments" />
            </div>
          ) : recent.length === 0 ? (
            <EmptyState title="No appointments yet" description="Bookings you make will show up here." />
          ) : (
            <div className="space-y-3">
              {recent.map((appointment) => (
                <AppointmentItem key={appointment.id} appointment={appointment} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </PageContainer>
  );
};

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <Card className="p-5">
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1.5 text-3xl font-semibold tabular-nums text-slate-900">{value}</p>
  </Card>
);

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-0.5 truncate text-sm font-medium text-slate-900" title={value}>
      {value}
    </dd>
  </div>
);

const formatMemberSince = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
};