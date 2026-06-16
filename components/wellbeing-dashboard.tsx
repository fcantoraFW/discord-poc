"use client";

import { Fragment, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { WellbeingCampaignType } from "@/lib/types/database";
import {
  closeActiveCampaign,
  launchWellbeingCampaign,
} from "@/lib/wellbeing/campaign-actions";
import { updateWellbeingAssistant, createWellbeingAssistantFromTemplate } from "@/lib/wellbeing/settings-actions";
import type { WellbeingDashboardData } from "@/lib/wellbeing/analytics";
import { PILLAR_LABELS, WELLBEING_PILLARS } from "@/lib/wellbeing/template";

type Props = {
  organizationId: string;
  data: WellbeingDashboardData;
};

export function WellbeingDashboard({ organizationId, data }: Props) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assistantId, setAssistantId] = useState(data.wellbeingAssistantId ?? "");
  const [campaignType, setCampaignType] = useState<WellbeingCampaignType>("wellbeing");

  const CAMPAIGN_TYPE_LABELS: Record<WellbeingCampaignType, string> = {
    wellbeing: "Bienestar",
    project_evaluation: "Evaluación de proyecto",
  };

  function runLaunch() {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await launchWellbeingCampaign(organizationId, campaignType);
        setMessage(
          `Campaña enviada: ${result.sent} DM(s) enviados${result.failed ? `, ${result.failed} fallidos` : ""}.`,
        );
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Error al lanzar campaña");
      }
    });
  }

  function runClose() {
    setMessage(null);
    startTransition(async () => {
      try {
        await closeActiveCampaign(organizationId);
        setMessage("Campaña activa cerrada.");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Error al cerrar campaña");
      }
    });
  }

  function runSaveAssistant() {
    setMessage(null);
    startTransition(async () => {
      try {
        await updateWellbeingAssistant(
          organizationId,
          assistantId === "" ? null : assistantId,
        );
        setMessage("Asistente de copy para encuestas actualizado.");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Error al guardar asistente");
      }
    });
  }

  function runProvisionAssistant() {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await createWellbeingAssistantFromTemplate(organizationId);
        setAssistantId(result.assistantId);
        setMessage(
          result.created
            ? "Asistente «Asistente de bienestar» creado y asignado. Editá instructions/context en Asistentes."
            : "Asistente de bienestar ya existía — asignado para encuestas.",
        );
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Error al crear asistente");
      }
    });
  }

  const responseRate =
    data.orgMemberCount > 0 && data.activeCampaign
      ? Math.round((data.campaignSubmissions / data.orgMemberCount) * 100)
      : null;

  return (
    <div className="space-y-8">
      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Campaña</h2>
        {data.activeCampaign ? (
          <div className="text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">Activa:</span>{" "}
              {data.activeCampaign.name}
            </p>
            <p>
              <span className="text-muted-foreground">Tipo:</span>{" "}
              {CAMPAIGN_TYPE_LABELS[data.activeCampaign.campaign_type]}
            </p>
            <p>
              <span className="text-muted-foreground">Inicio:</span>{" "}
              {data.activeCampaign.started_at
                ? new Date(data.activeCampaign.started_at).toLocaleString()
                : "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Respuestas:</span>{" "}
              {data.campaignSubmissions} / {data.orgMemberCount}
              {responseRate !== null ? ` (${responseRate}%)` : ""}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No hay campaña activa.</p>
        )}
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground block">Tipo de campaña</span>
            <select
              className="border rounded-md px-2 py-1.5 text-sm min-w-[220px]"
              value={campaignType}
              onChange={(e) => setCampaignType(e.target.value as WellbeingCampaignType)}
              disabled={pending || Boolean(data.activeCampaign)}
            >
              <option value="wellbeing">Bienestar</option>
              <option value="project_evaluation">Evaluación de proyecto</option>
            </select>
          </label>
          <Button type="button" disabled={pending || Boolean(data.activeCampaign)} onClick={runLaunch}>
            Enviar encuesta a todos
          </Button>
          {data.activeCampaign ? (
            <Button type="button" variant="outline" disabled={pending} onClick={runClose}>
              Cerrar campaña
            </Button>
          ) : null}
        </div>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        <p className="text-xs text-muted-foreground">
          Los members con Discord vinculado recibirán un DM con la encuesta cuando lances la
          campaña.
        </p>
      </section>

      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Asistente RRHH (copy)</h2>
        <p className="text-sm text-muted-foreground">
          Mismo patrón que los asistentes de chat: <code className="text-xs">name</code>,{" "}
          <code className="text-xs">instructions</code> (tono + intro) y{" "}
          <code className="text-xs">context</code> (detalle RRHH). No usa IA durante la encuesta.
          No se reutiliza el asistente de chat por defecto (ej. «Esperando la carroza»).
        </p>
        {!data.wellbeingAssistantId ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            Sin asistente de bienestar asignado — se usa copy genérico. Creá uno desde la plantilla
            o elegí un asistente existente.
          </div>
        ) : null}
        <div className="flex flex-wrap items-end gap-3">
          <Button type="button" disabled={pending} onClick={runProvisionAssistant}>
            Crear asistente de bienestar
          </Button>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground block">Asignar otro</span>
            <select
              className="border rounded-md px-2 py-1.5 text-sm min-w-[220px]"
              value={assistantId}
              onChange={(e) => setAssistantId(e.target.value)}
              disabled={pending}
            >
              <option value="">Sin asistente (copy genérico)</option>
              {data.assistants.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" variant="outline" disabled={pending} onClick={runSaveAssistant}>
            Guardar
          </Button>
        </div>
      </section>

      {data.activeCampaign?.campaign_type !== "project_evaluation" ? (
      <section className="space-y-3">
        <h2 className="font-semibold">Promedios por pilar</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.pillarAverages.map((p) => (
            <div key={p.pillar} className="border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">{p.label}</p>
              <p className="text-2xl font-bold mt-1">
                {p.average !== null ? p.average : "—"}
              </p>
              <p className="text-xs text-muted-foreground">{p.count} respuestas</p>
            </div>
          ))}
        </div>
      </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-semibold">Respuestas recientes</h2>
        {data.recentSubmissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay respuestas.</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Fecha</th>
                  <th className="text-left p-2 font-medium">Member</th>
                  <th className="text-left p-2 font-medium">Origen</th>
                  {WELLBEING_PILLARS.map((pillar) => (
                    <th key={pillar} className="text-left p-2 font-medium text-xs">
                      {PILLAR_LABELS[pillar].split(" ")[0]}
                    </th>
                  ))}
                  <th className="text-left p-2 font-medium">Pers.</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSubmissions.map((row) => (
                  <Fragment key={row.id}>
                    <tr
                      className="border-t cursor-pointer hover:bg-muted/30"
                      onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                    >
                      <td className="p-2 whitespace-nowrap">
                        {new Date(row.completed_at).toLocaleDateString()}
                      </td>
                      <td className="p-2">{row.profile_email}</td>
                      <td className="p-2">{row.source}</td>
                      {WELLBEING_PILLARS.map((pillar) => (
                        <td key={pillar} className="p-2">
                          {row.pillar_averages[pillar] ?? "—"}
                        </td>
                      ))}
                      <td className="p-2">{row.person_eval_count}</td>
                    </tr>
                    {expandedId === row.id ? (
                      <tr className="border-t bg-muted/20">
                        <td colSpan={3 + WELLBEING_PILLARS.length + 1} className="p-3 text-xs">
                          <div className="space-y-2">
                            <p className="font-medium">Comentarios por pilar</p>
                            <ul className="list-disc pl-4 space-y-1">
                              {row.pillar_details.map((p) => (
                                <li key={p.pillar}>
                                  {PILLAR_LABELS[p.pillar]}: {p.rating}/5
                                  {p.comment ? ` — "${p.comment}"` : ""}
                                </li>
                              ))}
                            </ul>
                            {row.person_details.length > 0 ? (
                              <>
                                <p className="font-medium mt-2">Evaluaciones de personas</p>
                                <ul className="list-disc pl-4 space-y-1">
                                  {row.person_details.map((p, i) => (
                                    <li key={`${p.evaluatee_name}-${i}`}>
                                      {p.evaluatee_name} ({p.relationship}): {p.rating}/5
                                      {p.comment ? ` — "${p.comment}"` : ""}
                                    </li>
                                  ))}
                                </ul>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
