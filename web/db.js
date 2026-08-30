import Dexie from 'https://cdn.jsdelivr.net/npm/dexie@4.0.10/+esm';

// Istanza condivisa del Database Dexie
const db = new Dexie('AppDatabase');

// Schema del DB: 'id' è PK per i descriptor; 'uri' è PK per le resource con indice 'deck' per query veloci
db.version(1).stores({
    'deck-descriptors': 'id',
    'deck-resources': 'uri, deck'
});

let deckRepoInstance = null;
let gameRepoInstance = null;

export class DeckRepository {
    constructor() {
        if (deckRepoInstance) {
            return deckRepoInstance;
        }
        this.db = db;
        this.tableDescriptors = db.table('deck-descriptors');
        this.tableResources = db.table('deck-resources');
        deckRepoInstance = this;
    }

    // --- DESCRIPTORS ---

    async hasDescriptor(id) {
        const count = await this.tableDescriptors.where('id').equals(id).count();
        return count > 0;
    }

    async saveDescriptor(descriptor) {
        if (!descriptor || !descriptor.id) {
            throw new Error('Descriptor non valido: manca la chiave id.');
        }
        const exists = await this.hasDescriptor(descriptor.id);
        if (exists) {
            throw new Error(`Descriptor con ID '${descriptor.id}' già esistente.`);
        }
        await this.tableDescriptors.add(descriptor);
    }

    async updateDescriptor(descriptor) {
        if (!descriptor || !descriptor.id) {
            throw new Error('Descriptor non valido: manca la chiave id.');
        }
        return await this.db.transaction('rw', this.tableDescriptors, async () => {
            const old = await this.tableDescriptors.get(descriptor.id);
            if (!old) {
                throw new Error(`Descriptor con ID '${descriptor.id}' non trovato per l'aggiornamento.`);
            }
            await this.tableDescriptors.put(descriptor);
            return old;
        });
    }

    async getDescriptor(id) {
        const item = await this.tableDescriptors.get(id);
        if (!item) {
            throw new Error(`Descriptor con ID '${id}' non trovato.`);
        }
        return item;
    }

    async getAllDescriptors() {
        // TODO
    }

    async deleteDescriptor(id) {
        return await this.db.transaction('rw', this.tableDescriptors, async () => {
            const old = await this.tableDescriptors.get(id);
            if (!old) {
                throw new Error(`Descriptor con ID '${id}' non trovato per l'eliminazione.`);
            }
            await this.tableDescriptors.delete(id);
            return old;
        });
    }

    // --- RESOURCES ---

    async hasResource(uri) {
        const count = await this.tableResources.where('uri').equals(uri).count();
        return count > 0;
    }

    async saveResource(resource) {
        if (!resource || !resource.uri) {
            throw new Error('Resource non valida: manca la chiave uri.');
        }
        const exists = await this.hasResource(resource.uri);
        if (exists) {
            throw new Error(`Resource con URI '${resource.uri}' già esistente.`);
        }
        await this.tableResources.add(resource);
    }

    async saveResources(resources) {
        if (!Array.isArray(resources)) return;
        await this.db.transaction('rw', this.tableResources, async () => {
            for (const res of resources) {
                const exists = await this.hasResource(res.uri);
                if (!exists) {
                    await this.tableResources.add(res);
                }
            }
        });
    }

    async updateResource(resource) {
        if (!resource || !resource.uri) {
            throw new Error('Resource non valida: manca la chiave uri.');
        }
        return await this.db.transaction('rw', this.tableResources, async () => {
            const old = await this.tableResources.get(resource.uri);
            if (!old) {
                throw new Error(`Resource con URI '${resource.uri}' non trovata per l'aggiornamento.`);
            }
            await this.tableResources.put(resource);
            return old;
        });
    }

    async updateResources(resources) {
        if (!Array.isArray(resources)) return;
        await this.db.transaction('rw', this.tableResources, async () => {
            await this.tableResources.bulkPut(resources);
        });
    }

    async getResource(uri) {
        const item = await this.tableResources.get(uri);
        if (!item) {
            throw new Error(`Resource con URI '${uri}' non trovata.`);
        }
        return item;
    }

    async getResourcesByDeck(deckId) {
        // TODO
    }

    async deleteResource(uri) {
        return await this.db.transaction('rw', this.tableResources, async () => {
            const old = await this.tableResources.get(uri);
            if (!old) {
                throw new Error(`Resource con URI '${uri}' non trovata per l'eliminazione.`);
            }
            await this.tableResources.delete(uri);
            return old;
        });
    }

    async deleteResourcesByDeck(deckId) {
        await this.tableResources.where('deck').equals(deckId).delete();
    }

}

export class GameRepository {

    // TOBE Let's do this another time, not now
    
    constructor() {
        if (gameRepoInstance) {
            return gameRepoInstance;
        }
        this.db = db;
        gameRepoInstance = this;
    }
}