"use client";

export interface PatientOption {
  id: string;
  name: string;
}

export function PatientMultiselect({
  patients,
  selected,
  onChange,
  capacity,
}: {
  patients: PatientOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  capacity: number;
}) {
  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((selectedId) => selectedId !== id));
      return;
    }
    if (selected.length >= capacity) {
      return;
    }
    onChange([...selected, id]);
  }

  return (
    <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium">
        Pacientes ({selected.length}/{capacity})
      </legend>
      {patients.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum paciente ativo cadastrado.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {patients.map((patient) => {
            const checked = selected.includes(patient.id);
            const disabled = !checked && selected.length >= capacity;
            return (
              <li key={patient.id}>
                <label className={`flex items-center gap-2 text-sm ${disabled ? "text-muted-foreground" : ""}`}>
                  <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(patient.id)} />
                  {patient.name}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
