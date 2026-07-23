export function ComingSoon({ label }: { label: string }) {
  return (
    <div className="mx-auto mt-20 flex max-w-[420px] flex-col items-center gap-2 text-center">
      <h1 className="text-lg font-bold tracking-tight">{label}</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Esta área ainda não foi implementada no sistema — chega numa próxima fase do produto.
      </p>
    </div>
  );
}
