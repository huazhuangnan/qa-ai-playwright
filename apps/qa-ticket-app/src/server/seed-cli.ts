import { createDatabase } from './db/client.ts';
import { seedDatabase } from './seed.ts';

const database = createDatabase();
try {
  const result = seedDatabase(database);
  console.log(
    JSON.stringify(
      {
        status: 'ok',
        createdTickets: result.createdTickets,
        users: result.users,
      },
      null,
      2,
    ),
  );
} finally {
  database.close();
}
