-- Surveys are campaign-DM only; normalize legacy source values.

update public.wellbeing_sessions
set source = 'campaign'
where source = 'encuesta';

update public.wellbeing_submissions
set source = 'campaign'
where source = 'encuesta';

alter table public.wellbeing_sessions
alter column source set default 'campaign';

alter table public.wellbeing_submissions
alter column source set default 'campaign';
