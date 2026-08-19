insert into clubs (name, access_code, username, password_hash)
values ('Club de pruebas', '001', 'club', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4');

insert into users (club_id, username, password_hash, role, status, nickname, side)
select id, 'oscar', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 'coach', 'active', null, null
from clubs where access_code = '001';

insert into users (club_id, username, password_hash, role, status, nickname, side)
select id, 'marina', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 'coach', 'active', null, null
from clubs where access_code = '001';

insert into users (club_id, username, password_hash, role, status, nickname, side)
select id, 'metra', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 'coach', 'active', null, null
from clubs where access_code = '001';

insert into users (club_id, username, password_hash, role, status, nickname, side)
select id, 'oscar1', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 'rower', 'active', 'Oscar', 'babor'
from clubs where access_code = '001';

insert into users (club_id, username, password_hash, role, status, nickname, side)
select id, 'marina1', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 'rower', 'active', 'Marina', 'estribor'
from clubs where access_code = '001';

insert into users (club_id, username, password_hash, role, status, nickname, side)
select id, 'metra1', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 'rower', 'active', 'Metra', 'ambos'
from clubs where access_code = '001';
