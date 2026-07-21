<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/crud.php';

// passwordHash is deliberately NOT in this list — see crud_decode()'s own
// comment on why that alone is enough to keep it out of every response
// this generic endpoint can produce, no matter the verb. The only code
// that ever reads or writes that column lives in auth/employee_login.php
// and auth/employee_set_password.php.
handle_crud($pdo, 'user_accounts', [
  'id' => 'string',
  'userNumber' => 'string',
  'username' => 'string',
  'loginAccount' => 'string',
  'userGroup' => 'string',
  'mail' => 'string',
  'phoneNumber' => 'string',
  'enabled' => 'bool',
  'createdAt' => 'int',
  'updatedAt' => 'int',
  'lastLoginAt' => 'int',
  'history' => 'json',
  'authUserId' => 'string',
], 'id', 'createdAt', 'DESC');