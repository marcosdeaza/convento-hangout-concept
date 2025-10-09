#!/usr/bin/env python3
"""
Script para limpiar completamente la base de datos de Convento
Elimina: usuarios, mensajes, canales de voz, códigos de acceso
"""

import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient

async def clean_database():
    # Conectar a MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    client = AsyncIOMotorClient(mongo_url)
    db = client.convento
    
    print("🗑️ Limpiando base de datos de Convento...")
    
    try:
        # Limpiar colecciones
        collections = ['users', 'messages', 'voice_channels', 'access_codes']
        
        for collection_name in collections:
            result = await db[collection_name].delete_many({})
            print(f"✅ {collection_name}: {result.deleted_count} documentos eliminados")
        
        print("🎉 Base de datos limpiada completamente")
        
    except Exception as e:
        print(f"❌ Error limpiando base de datos: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(clean_database())