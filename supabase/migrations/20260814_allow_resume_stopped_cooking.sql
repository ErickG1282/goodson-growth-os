do $$
declare
  transition_definition text;
  updated_definition text;
begin
  select pg_get_functiondef(
    'public.gbgs_transition_production_order(uuid,uuid,text,text)'::regprocedure
  ) into transition_definition;

  updated_definition:=replace(
    transition_definition,
    'IF current_order.production_status <> ''Paused''::text THEN',
    'IF current_order.production_status NOT IN (''Paused''::text, ''Stopped''::text) THEN'
  );
  updated_definition:=replace(
    updated_definition,
    'RAISE EXCEPTION ''Only paused cooking can be resumed''',
    'RAISE EXCEPTION ''Only paused or stopped cooking can be resumed'''
  );
  updated_definition:=replace(
    updated_definition,
    'RAISE EXCEPTION ''Only paused production can be resumed''',
    'RAISE EXCEPTION ''Only paused or stopped production can be resumed'''
  );

  if updated_definition=transition_definition then
    if transition_definition like '%production_status NOT IN (%Paused%Stopped%' then
      return;
    end if;
    raise exception 'Could not locate the existing paused-only resume guard';
  end if;

  execute updated_definition;
end $$;
